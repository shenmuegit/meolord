// Wolfcha's game phases and generators run here so only the room can call a model.
// The homepage supplies one human seat; the original eight-seat rules are unchanged.
import type { GameState, Player, Phase } from "@/vendor/wolfcha/types/game";
import { isWolfRole } from "@/vendor/wolfcha/types/game";
import type { FlowToken } from "@/vendor/wolfcha/lib/game-flow-controller";
import {
  addPlayerMessage, addSystemMessage, checkWinCondition, createInitialGameState,
  generateAIBadgeSignupBatch, generateAIBadgeVote, generateAISpeechSegmentsStream,
  generateAIVote, generateBadgeTransfer, generateDailySummary, generateHunterShoot,
  getNextAliveSeat, getRandomHumanSeat, killPlayer, setupPlayers, transitionPhase,
  BADGE_TRANSFER_TORN, BADGE_VOTE_ABSTAIN,
} from "@/vendor/wolfcha/lib/game-master";
import { PhaseManager } from "@/vendor/wolfcha/game/core/PhaseManager";
import { generateCharacters, sampleModelRefs } from "@/vendor/wolfcha/lib/character-generator";
import { getRandomScenario } from "@/vendor/wolfcha/lib/scenarios";
import { getSystemMessages } from "@/vendor/wolfcha/lib/game-texts";
import { getI18n } from "@/vendor/wolfcha/i18n/translator";
import { recordVoteRound } from "@/vendor/wolfcha/lib/vote-rounds";

export type HumanAction =
  | { type: "reveal" }
  | { type: "speech"; text: string }
  | { type: "vote"; seat: number }
  | { type: "badge-signup"; signup: boolean }
  | { type: "night"; seat: number; choice?: "save" | "poison" | "pass" }
  | { type: "hunter"; seat: number }
  | { type: "badge-transfer"; seat: number };

type NightContinuation = "CONTINUE_NIGHT_AFTER_WOLF" | "CONTINUE_NIGHT_AFTER_WITCH" | "RESOLVE_NIGHT";
type DeathContinuation = "after-night" | "after-vote" | "after-night-hunter" | "after-vote-hunter";

export type Room = {
  token: string;
  state: GameState;
  updatedAt: number;
  aiCalls: number;
  revealed: boolean;
  pendingAdvance?: boolean;
  nextNight?: NightContinuation;
  pendingHunter?: { seat: number; diedAtNight: boolean };
  hunterChoice?: number;
  afterBadgeTransfer?: DeathContinuation;
  badgeTransferred?: boolean;
  deadSheriffSeat?: number;
};

export type StartProgress =
  | { type: "seating"; humanSeat: number }
  | { type: "character"; seat: number; name: string }
  | { type: "reset" };

const MAX_AI_CALLS = 80;
const speechPhases = new Set<Phase>(["DAY_SPEECH", "DAY_BADGE_SPEECH", "DAY_PK_SPEECH", "DAY_LAST_WORDS"]);
const texts = getSystemMessages("zh");
const t = getI18n("zh").t;

function me(room: Room): Player {
  const player = room.state.players.find((candidate) => candidate.isHuman);
  if (!player) throw new Error("对局没有真人玩家");
  return player;
}

function playerAt(state: GameState, seat: number): Player | undefined {
  return state.players.find((player) => player.seat === seat);
}

function aliveTarget(state: GameState, seat: number): boolean {
  return Number.isInteger(seat) && playerAt(state, seat)?.alive === true;
}

function countCall(room: Room): void {
  if (room.aiCalls >= MAX_AI_CALLS) throw new Error("本局已达到 AI 行动上限");
  room.aiCalls += 1;
}

export async function newRoom(name: string, token: string, emit: (event: StartProgress) => void = () => {}): Promise<Room> {
  const humanName = name.trim().slice(0, 24);
  if (!humanName) throw new Error("请输入名字");
  const scenario = getRandomScenario();
  const humanSeat = getRandomHumanSeat(8);
  emit({ type: "seating", humanSeat });
  const options = { onCharacter: (index: number, character: { displayName: string }) =>
    emit({ type: "character", seat: index >= humanSeat ? index + 1 : index, name: character.displayName }) };
  let characters;
  try {
    characters = await generateCharacters(7, scenario, options);
  } catch (error) {
    if (!(error instanceof Error) || !/invalid JSON|invalid schema|incomplete batches/.test(error.message)) throw error;
    emit({ type: "reset" });
    characters = await generateCharacters(7, scenario, options);
  }
  if (characters.length !== 7) throw new Error("玩家生成失败");
  const state: GameState = {
    ...createInitialGameState(),
    gameSessionId: crypto.randomUUID(),
    scenario,
    players: setupPlayers(characters, humanSeat, humanName, 8, undefined, undefined, sampleModelRefs(7)),
    phase: "NIGHT_START",
    day: 1,
    startTime: Date.now(),
  };
  return {
    token,
    state: addSystemMessage(addSystemMessage(state, texts.gameStart), texts.nightFall(1)),
    revealed: false,
    aiCalls: 0,
    updatedAt: Date.now(),
  };
}

export function waitingForHuman(room: Room): boolean {
  const { state } = room;
  const human = me(room);
  if (state.phase === "NIGHT_START") return state.day === 1 && !room.revealed;
  if (state.phase === "NIGHT_WOLF_ACTION") return human.alive && isWolfRole(human.role) && !room.nextNight;
  if (state.phase === "NIGHT_WITCH_ACTION") return human.alive && human.role === "Witch" && !room.nextNight &&
    (!state.roleAbilities.witchHealUsed || !state.roleAbilities.witchPoisonUsed);
  if (state.phase === "NIGHT_SEER_ACTION") return human.alive && human.role === "Seer" &&
    state.nightActions.seerTarget === undefined && !room.nextNight;
  if (speechPhases.has(state.phase)) return state.currentSpeakerSeat === human.seat && !room.pendingAdvance &&
    (human.alive || state.phase === "DAY_LAST_WORDS");
  if (state.phase === "DAY_BADGE_SIGNUP") return human.alive && state.badge.signup[human.playerId] === undefined;
  if (state.phase === "DAY_BADGE_ELECTION") return human.alive && !state.badge.candidates.includes(human.seat) &&
    state.badge.votes[human.playerId] === undefined;
  if (state.phase === "DAY_VOTE") return human.alive && !(state.pkSource === "vote" && state.pkTargets?.includes(human.seat)) &&
    state.votes[human.playerId] === undefined;
  if (state.phase === "HUNTER_SHOOT") return room.pendingHunter?.seat === human.seat && room.hunterChoice === undefined;
  if (state.phase === "BADGE_TRANSFER") return state.badge.holderSeat === human.seat && !room.badgeTransferred;
  return false;
}

function finishGame(room: Room, winner: "village" | "wolf" | null): void {
  room.state = { ...transitionPhase(room.state, "GAME_END"), winner };
  if (winner) room.state = addSystemMessage(room.state, winner === "village" ? texts.villageWin : texts.wolfWin);
  room.state = addSystemMessage(room.state, "[ROLE_REVEAL]" + JSON.stringify({
    players: room.state.players.map((player) => ({
      seat: player.seat, name: player.displayName, role: player.role, isHuman: player.isHuman,
    })),
  }));
}

function endIfHumanDead(room: Room): void {
  const human = me(room);
  if (human.alive || room.state.phase === "GAME_END") return;
  if (room.state.phase === "DAY_LAST_WORDS" && room.state.currentSpeakerSeat === human.seat) return;
  if (room.state.phase === "HUNTER_SHOOT" && room.pendingHunter?.seat === human.seat) return;
  if (room.state.phase === "BADGE_TRANSFER" && room.state.badge.holderSeat === human.seat) return;
  finishGame(room, checkWinCondition(room.state));
}

function startBadgeSignup(room: Room): void {
  room.state = addSystemMessage({
    ...transitionPhase(room.state, "DAY_BADGE_SIGNUP"),
    currentSpeakerSeat: null,
    daySpeechStartSeat: null,
    badge: { ...room.state.badge, signup: {}, candidates: [] },
  }, t("badgePhase.signupStart"));
}

function startBadgeSpeech(room: Room, candidates: number[]): void {
  const startSeat = candidates[Math.floor(Math.random() * candidates.length)] ?? null;
  room.state = addSystemMessage({
    ...transitionPhase(room.state, "DAY_BADGE_SPEECH"),
    currentSpeakerSeat: startSeat,
    daySpeechStartSeat: startSeat,
    badge: { ...room.state.badge, candidates },
  }, texts.badgeSpeechStart);
}

function startBadgeElection(room: Room, revote = false): void {
  const candidates = room.state.badge.candidates;
  room.state = {
    ...transitionPhase(room.state, "DAY_BADGE_ELECTION"),
    currentSpeakerSeat: null,
    badge: { ...room.state.badge, votes: {}, revoteCount: revote ? room.state.badge.revoteCount : 0 },
  };
  if (!revote) room.state = addSystemMessage(room.state, texts.badgeElectionStart);
  if (candidates.length === 1) {
    const seat = candidates[0];
    const winner = playerAt(room.state, seat);
    room.state = addSystemMessage({
      ...room.state,
      badge: {
        ...room.state.badge,
        holderSeat: seat,
        allVotes: {},
        history: { ...room.state.badge.history, [room.state.day]: {} },
        electionWinners: { ...room.state.badge.electionWinners, [room.state.day]: seat },
      },
    }, t("badgePhase.autoElected", { seat: seat + 1, name: winner?.displayName ?? "" }));
    room.state = { ...room.state, phase: "DAY_START" };
  }
}

function startVote(room: Room, revote = false): void {
  room.state = addSystemMessage({
    ...transitionPhase(room.state, "DAY_VOTE"),
    currentSpeakerSeat: null,
    nextSpeakerSeatOverride: null,
    lastVoteReasons: room.state.voteReasons ? { ...room.state.voteReasons } : {},
    voteReasons: {},
    votes: {},
    pkTargets: revote ? room.state.pkTargets : undefined,
    pkSource: revote ? "vote" : undefined,
  }, texts.voteStart);
}

function enterPkSpeech(room: Room, targets: number[], source: "badge" | "vote"): void {
  const first = targets[0] ?? null;
  room.state = addSystemMessage({
    ...transitionPhase(room.state, "DAY_PK_SPEECH"),
    pkTargets: targets,
    pkSource: source,
    currentSpeakerSeat: first,
    daySpeechStartSeat: first,
    badge: source === "badge"
      ? { ...room.state.badge, candidates: targets, votes: {} }
      : room.state.badge,
  }, t(source === "badge" ? "badgePhase.tiePk" : "votePhase.tiePk"));
}

function resolveBadgeElection(room: Room): void {
  const state = room.state;
  const candidates = state.badge.candidates;
  const counts = new Map<number, number>();
  for (const seat of Object.values(state.badge.votes)) {
    if (candidates.includes(seat)) counts.set(seat, (counts.get(seat) ?? 0) + 1);
  }
  const max = Math.max(0, ...counts.values());
  const top = [...counts].filter(([, votes]) => votes === max).map(([seat]) => seat);
  const round = (state.badge.revoteCount || 0) + 1;
  room.state = recordVoteRound(state, {
    kind: "badge", round, candidates, votes: state.badge.votes, sheriffSeat: null,
    winnerSeat: top.length === 1 ? top[0] : null,
    outcome: top.length === 1 ? "elected" : top.length ? "tie" : "no-votes",
  });
  const voteDetails = "[VOTE_RESULT]" + JSON.stringify({
    title: t("badgePhase.voteDetailTitle"),
    results: candidates.map((seat) => ({
      targetSeat: seat, targetName: playerAt(state, seat)?.displayName ?? "",
      voterSeats: state.players.filter((p) => state.badge.votes[p.playerId] === seat).map((p) => p.seat),
      voteCount: counts.get(seat) ?? 0,
    })),
  });
  room.state = addSystemMessage(room.state, voteDetails);
  if (top.length === 1) {
    const seat = top[0];
    room.state = addSystemMessage({
      ...room.state,
      badge: {
        ...room.state.badge, holderSeat: seat, allVotes: {},
        history: { ...room.state.badge.history, [state.day]: { ...state.badge.votes } },
        electionWinners: { ...room.state.badge.electionWinners, [state.day]: seat },
      },
    }, texts.badgeElected(seat + 1, playerAt(state, seat)?.displayName ?? "", max));
    room.state = { ...room.state, phase: "DAY_START" };
  } else if (top.length > 1 && round < 2) {
    room.state = {
      ...room.state,
      badge: { ...room.state.badge, allVotes: { ...state.badge.votes }, revoteCount: round },
    };
    enterPkSpeech(room, top, "badge");
  } else {
    room.state = addSystemMessage({
      ...room.state,
      badge: {
        ...room.state.badge, holderSeat: null, candidates: [], votes: {}, allVotes: {},
        revoteCount: round,
        history: { ...room.state.badge.history, [state.day]: { ...state.badge.votes } },
        electionWinners: { ...room.state.badge.electionWinners, [state.day]: null },
      },
    }, t(top.length ? "badgePhase.tieTear" : "badgePhase.noVotes"));
    room.state = { ...room.state, phase: "DAY_START" };
  }
}

function resolveNight(room: Room): void {
  const state = transitionPhase(room.state, "NIGHT_RESOLVE");
  const { wolfTarget, guardTarget, witchSave, witchPoison } = state.nightActions;
  const deaths: Array<{ seat: number; reason: "wolf" | "poison" | "milk" }> = [];
  const wolfDied = wolfTarget !== undefined &&
    ((guardTarget === wolfTarget && witchSave === true) || (guardTarget !== wolfTarget && witchSave !== true));
  if (wolfDied) deaths.push({ seat: wolfTarget!, reason: guardTarget === wolfTarget ? "milk" : "wolf" });
  if (witchPoison !== undefined) {
    const previous = deaths.find((death) => death.seat === witchPoison);
    if (previous) previous.reason = "poison";
    else deaths.push({ seat: witchPoison, reason: "poison" });
  }
  room.state = addSystemMessage({
    ...transitionPhase({
      ...state,
      nightActions: {
        ...state.nightActions,
        lastGuardTarget: guardTarget,
        pendingWolfVictim: wolfDied ? wolfTarget : undefined,
        pendingPoisonVictim: witchPoison,
      },
      nightHistory: {
        ...state.nightHistory,
        [state.day]: {
          guardTarget, wolfTarget, witchSave, witchPoison,
          seerTarget: state.nightActions.seerTarget,
          seerResult: state.nightActions.seerResult,
          deaths, resultsAnnounced: false,
        },
      },
    }, "DAY_START"),
  }, texts.dayBreak);
  if (room.state.day === 1) startBadgeSignup(room);
}

async function startDiscussion(room: Room, signal?: AbortSignal, skipAnnouncements = false): Promise<void> {
  const phase = new PhaseManager().getPhase("DAY_SPEECH");
  if (!phase) throw new Error("缺少白天阶段");
  const token: FlowToken = { value: 0, isValid: () => !signal?.aborted };
  const setGameState = (value: GameState | ((previous: GameState) => GameState)) => {
    room.state = typeof value === "function" ? value(room.state) : value;
  };
  await phase.handleAction({
    state: room.state, extras: {
      token, setGameState, setDialogue: () => {}, waitForUnpause: async () => {},
      runAISpeech: async () => {}, onWhiteWolfKingBoomCheck: async () => false,
      onStartVote: async () => startVote(room),
      onBadgeSpeechEnd: async () => startBadgeElection(room),
      onPkSpeechEnd: async () => {
        if (room.state.pkSource === "badge") {
          room.state = { ...room.state, pkTargets: undefined, pkSource: undefined };
          startBadgeElection(room, true);
        } else startVote(room, true);
      },
      onBadgeTransfer: async (state: GameState, sheriff: Player, afterTransfer: (next: GameState) => Promise<void>) => {
        room.state = state;
        await transferBadge(room, sheriff, "after-night", signal);
        if (!sheriff.isHuman) {
          await afterTransfer(room.state);
          room.afterBadgeTransfer = undefined;
          room.deadSheriffSeat = undefined;
        }
      },
      onHunterDeath: async (state: GameState, hunter: Player) => {
        room.state = state;
        startHunter(room, hunter, true);
      },
      onGameEnd: async (state: GameState, winner: "village" | "wolf") => {
        room.state = state;
        finishGame(room, winner);
      },
    },
  }, { type: "START_DAY_SPEECH_AFTER_BADGE", options: { skipAnnouncements } });
}

async function advanceSpeaker(room: Room, signal?: AbortSignal): Promise<void> {
  const phase = new PhaseManager().getPhase("DAY_SPEECH");
  if (!phase) throw new Error("缺少发言阶段");
  const token: FlowToken = { value: 0, isValid: () => !signal?.aborted };
  await phase.handleAction({
    state: room.state, extras: {
      token,
      setGameState: (value: GameState | ((previous: GameState) => GameState)) => {
        room.state = typeof value === "function" ? value(room.state) : value;
      },
      setDialogue: () => {}, waitForUnpause: async () => {}, runAISpeech: async () => {},
      onWhiteWolfKingBoomCheck: async () => false,
      onStartVote: async () => startVote(room),
      onBadgeSpeechEnd: async () => startBadgeElection(room),
      onPkSpeechEnd: async () => {
        if (room.state.pkSource === "badge") {
          room.state = { ...room.state, pkTargets: undefined, pkSource: undefined };
          startBadgeElection(room, true);
        } else startVote(room, true);
      },
      onBadgeTransfer: async () => {}, onHunterDeath: async () => {}, onGameEnd: async () => {},
    },
  }, { type: "ADVANCE_SPEAKER" });
}

async function transferBadge(room: Room, sheriff: Player, after: DeathContinuation, signal?: AbortSignal): Promise<void> {
  room.state = addSystemMessage(transitionPhase(room.state, "BADGE_TRANSFER"),
    texts.badgeTransferStart(sheriff.seat + 1, sheriff.displayName));
  room.afterBadgeTransfer = after;
  room.deadSheriffSeat = sheriff.seat;
  if (sheriff.isHuman) return;
  countCall(room);
  const seat = await generateBadgeTransfer(room.state, sheriff);
  signal?.throwIfAborted();
  applyBadgeTransfer(room, seat);
}

function applyBadgeTransfer(room: Room, seat: number): void {
  const sheriffSeat = room.state.badge.holderSeat;
  const sheriff = sheriffSeat === null ? undefined : playerAt(room.state, sheriffSeat);
  if (!sheriff || sheriffSeat === null) throw new Error("警长不存在");
  if (seat !== BADGE_TRANSFER_TORN && (!aliveTarget(room.state, seat) || seat === sheriffSeat)) throw new Error("移交目标无效");
  room.state = {
    ...room.state,
    badge: { ...room.state.badge, holderSeat: seat === BADGE_TRANSFER_TORN ? null : seat },
  };
  room.state = addSystemMessage(room.state, seat === BADGE_TRANSFER_TORN
    ? texts.badgeTorn(sheriffSeat + 1, sheriff.displayName)
    : texts.badgeTransferred(sheriffSeat + 1, seat + 1, playerAt(room.state, seat)?.displayName ?? ""));
}

function startHunter(room: Room, hunter: Player, diedAtNight: boolean): void {
  room.pendingHunter = { seat: hunter.seat, diedAtNight };
  room.state = transitionPhase(room.state, "HUNTER_SHOOT");
}

async function finishHunter(room: Room, seat: number, signal?: AbortSignal): Promise<void> {
  const pending = room.pendingHunter;
  if (!pending) throw new Error("没有待处理的猎人行动");
  if (seat >= 0) {
    if (!aliveTarget(room.state, seat)) throw new Error("猎人目标无效");
    room.state = killPlayer(room.state, seat);
    room.state = addSystemMessage(room.state,
      texts.hunterShoot(pending.seat + 1, seat + 1, playerAt(room.state, seat)?.displayName ?? ""));
    const record = { hunterSeat: pending.seat, targetSeat: seat };
    if (pending.diedAtNight) {
      room.state = {
        ...room.state,
        nightHistory: {
          ...room.state.nightHistory,
          [room.state.day]: { ...room.state.nightHistory?.[room.state.day], hunterShot: record },
        },
      };
    } else {
      room.state = {
        ...room.state,
        dayHistory: {
          ...room.state.dayHistory,
          [room.state.day]: { ...room.state.dayHistory?.[room.state.day], hunterShot: record },
        },
      };
    }
  }
  room.pendingHunter = undefined;
  room.hunterChoice = undefined;
  const winner = checkWinCondition(room.state);
  if (winner) finishGame(room, winner);
  else {
    const sheriffSeat = room.state.badge.holderSeat;
    const deadSheriff = sheriffSeat === null ? undefined : playerAt(room.state, sheriffSeat);
    if (deadSheriff && !deadSheriff.alive) {
      await transferBadge(room, deadSheriff, pending.diedAtNight ? "after-night-hunter" : "after-vote-hunter", signal);
      if (deadSheriff.isHuman) return;
      room.afterBadgeTransfer = undefined;
      room.deadSheriffSeat = undefined;
    }
    if (pending.diedAtNight) await startDiscussion(room, signal, true);
    else await proceedNight(room);
  }
}

async function resumeAfterNightBadgeTransfer(room: Room, signal?: AbortSignal): Promise<void> {
  const deadSheriff = playerAt(room.state, room.deadSheriffSeat ?? -1);
  const death = room.state.nightHistory?.[room.state.day]?.deaths?.find((item) => item.seat === deadSheriff?.seat);
  if (deadSheriff?.role === "Hunter" && death && death.reason !== "poison" && room.state.roleAbilities.hunterCanShoot) {
    startHunter(room, deadSheriff, true);
    return;
  }
  const winner = checkWinCondition(room.state);
  if (winner) { finishGame(room, winner); return; }
  await startDiscussion(room, signal, true);
  if (deadSheriff && room.state.phase === "DAY_SPEECH" && room.state.badge.holderSeat === null) {
    const startSeat = getNextAliveSeat(room.state, deadSheriff.seat, false, "clockwise");
    room.state = { ...room.state, daySpeechStartSeat: startSeat, currentSpeakerSeat: startSeat };
  }
}

async function afterLastWords(room: Room, signal?: AbortSignal): Promise<void> {
  const executed = room.state.dayHistory?.[room.state.day]?.executed;
  const player = executed ? playerAt(room.state, executed.seat) : undefined;
  if (player && room.state.badge.holderSeat === player.seat) {
    await transferBadge(room, player, "after-vote", signal);
    if (room.state.phase === "BADGE_TRANSFER") return;
  }
  if (player?.role === "Hunter" && room.state.roleAbilities.hunterCanShoot) {
    startHunter(room, player, false);
    return;
  }
  const winner = checkWinCondition(room.state);
  if (winner) finishGame(room, winner);
  else await proceedNight(room);
}

async function proceedNight(room: Room): Promise<void> {
  const previous = room.state;
  countCall(room);
  const summary = await generateDailySummary(previous).catch(() => ({ bullets: [] as string[], voteData: undefined }));
  room.state = addSystemMessage({
    ...transitionPhase(previous, "NIGHT_START"),
    day: previous.day + 1,
    nightActions: {
      ...(previous.nightActions.guardTarget !== undefined ? { lastGuardTarget: previous.nightActions.guardTarget } : {}),
      ...(previous.nightActions.seerHistory ? { seerHistory: previous.nightActions.seerHistory } : {}),
    },
    dailySummaries: summary.bullets.length
      ? { ...previous.dailySummaries, [previous.day]: summary.bullets }
      : previous.dailySummaries,
    dailySummaryVoteData: summary.voteData
      ? { ...previous.dailySummaryVoteData, [previous.day]: summary.voteData }
      : previous.dailySummaryVoteData,
  }, texts.nightFall(previous.day + 1));
}

async function resolveVotes(room: Room, signal?: AbortSignal): Promise<void> {
  const phase = new PhaseManager().getPhase("DAY_VOTE");
  if (!phase) throw new Error("缺少投票阶段");
  const token: FlowToken = { value: 0, isValid: () => !signal?.aborted };
  await phase.handleAction({
    state: room.state, extras: {
      token, humanPlayer: me(room), getGameState: () => room.state,
      setGameState: (value: GameState | ((previous: GameState) => GameState)) => {
        room.state = typeof value === "function" ? value(room.state) : value;
      },
      setDialogue: () => {}, setIsWaitingForAI: () => {}, waitForUnpause: async () => {},
      isTokenValid: (current: FlowToken) => current.isValid(),
      runAISpeech: async () => {},
      onGameEnd: async (state: GameState, winner: "village" | "wolf") => {
        room.state = state;
        finishGame(room, winner);
      },
      onVoteComplete: async (state: GameState, result: { seat: number; count: number } | null) => {
        room.state = state;
        if (!result) { await proceedNight(room); return; }
        const player = playerAt(state, result.seat);
        if (!player) throw new Error("放逐目标不存在");
        room.state = addSystemMessage({
          ...transitionPhase(killPlayer(state, result.seat), "DAY_LAST_WORDS"),
          currentSpeakerSeat: result.seat,
        }, t("dayPhase.lastWordsSystem", { seat: result.seat + 1, name: player.displayName }));
      },
    },
  }, { type: "RESOLVE_VOTES" });
}

export function act(room: Room, action: HumanAction): boolean {
  if (!waitingForHuman(room)) return false;
  const state = room.state;
  const human = me(room);
  if (action.type === "reveal") {
    if (state.phase !== "NIGHT_START") return false;
    room.revealed = true;
  } else if (action.type === "speech") {
    if (!speechPhases.has(state.phase) || state.currentSpeakerSeat !== human.seat ||
        typeof action.text !== "string" || action.text.length > 500) return false;
    const content = action.text.trim();
    if (content) room.state = addPlayerMessage(state, human.playerId, content, { isLastWords: state.phase === "DAY_LAST_WORDS" });
    else room.pendingAdvance = true;
  } else if (action.type === "badge-signup") {
    if (state.phase !== "DAY_BADGE_SIGNUP" || typeof action.signup !== "boolean") return false;
    room.state = { ...state, badge: { ...state.badge, signup: { ...state.badge.signup, [human.playerId]: action.signup } } };
  } else if (action.type === "vote") {
    if (!aliveTarget(state, action.seat) || action.seat === human.seat) return false;
    if (state.phase === "DAY_BADGE_ELECTION") {
      if (!state.badge.candidates.includes(action.seat)) return false;
      room.state = { ...state, badge: { ...state.badge, votes: { ...state.badge.votes, [human.playerId]: action.seat } } };
    } else if (state.phase === "DAY_VOTE") {
      if (state.pkSource === "vote" && !state.pkTargets?.includes(action.seat)) return false;
      room.state = { ...state, votes: { ...state.votes, [human.playerId]: action.seat } };
    } else return false;
  } else if (action.type === "night") {
    if (state.phase === "NIGHT_WOLF_ACTION" && isWolfRole(human.role) && aliveTarget(state, action.seat)) {
      const wolfVotes = Object.fromEntries(state.players.filter((p) => p.alive && isWolfRole(p.role)).map((p) => [p.playerId, action.seat]));
      room.state = { ...state, nightActions: { ...state.nightActions, wolfVotes, wolfTarget: action.seat } };
      room.nextNight = "CONTINUE_NIGHT_AFTER_WOLF";
    } else if (state.phase === "NIGHT_WITCH_ACTION" && human.role === "Witch") {
      if (action.choice === "save" && !state.roleAbilities.witchHealUsed && state.nightActions.wolfTarget !== undefined) {
        room.state = { ...state, nightActions: { ...state.nightActions, witchSave: true },
          roleAbilities: { ...state.roleAbilities, witchHealUsed: true } };
      } else if (action.choice === "poison" && !state.roleAbilities.witchPoisonUsed && aliveTarget(state, action.seat)) {
        room.state = { ...state, nightActions: { ...state.nightActions, witchPoison: action.seat },
          roleAbilities: { ...state.roleAbilities, witchPoisonUsed: true } };
      } else if (action.choice !== "pass") return false;
      room.nextNight = "CONTINUE_NIGHT_AFTER_WITCH";
    } else if (state.phase === "NIGHT_SEER_ACTION" && human.role === "Seer" &&
      aliveTarget(state, action.seat) && action.seat !== human.seat) {
      const isWolf = isWolfRole(playerAt(state, action.seat)?.role);
      room.state = { ...state, nightActions: {
        ...state.nightActions, seerTarget: action.seat, seerResult: { targetSeat: action.seat, isWolf },
        seerHistory: [...(state.nightActions.seerHistory ?? []), { targetSeat: action.seat, isWolf, day: state.day }],
      } };
      room.nextNight = "RESOLVE_NIGHT";
    } else return false;
  } else if (action.type === "hunter") {
    if (state.phase !== "HUNTER_SHOOT" || room.pendingHunter?.seat !== human.seat ||
      (action.seat !== -1 && !aliveTarget(state, action.seat))) return false;
    room.hunterChoice = action.seat;
  } else if (action.type === "badge-transfer") {
    if (state.phase !== "BADGE_TRANSFER" || state.badge.holderSeat !== human.seat ||
      (action.seat !== -1 && (!aliveTarget(state, action.seat) || action.seat === human.seat))) return false;
    applyBadgeTransfer(room, action.seat);
    room.badgeTransferred = true;
  } else return false;
  room.updatedAt = Date.now();
  return true;
}

export async function step(
  room: Room,
  emit: (speaker: string, index: number, text: string) => void = () => {},
  signal?: AbortSignal,
): Promise<boolean> {
  if (waitingForHuman(room) || room.state.phase === "GAME_END") return false;
  const state = room.state;
  const human = me(room);
  if (state.phase === "NIGHT_START" || state.phase === "NIGHT_WOLF_ACTION" ||
      state.phase === "NIGHT_WITCH_ACTION" || state.phase === "NIGHT_SEER_ACTION") {
    const next = room.nextNight;
    room.nextNight = undefined;
    if (next === "RESOLVE_NIGHT") resolveNight(room);
    else {
      const phase = new PhaseManager().getPhase("NIGHT_START");
      if (!phase) throw new Error("缺少夜晚阶段");
      const token: FlowToken = { value: 0, isValid: () => !signal?.aborted };
      await phase.handleAction({
        state, extras: {
          token,
          setGameState: (value: GameState | ((previous: GameState) => GameState)) => {
            room.state = typeof value === "function" ? value(room.state) : value;
          },
          setDialogue: () => {}, setIsWaitingForAI: () => {}, waitForUnpause: async () => {},
          isTokenValid: (current: FlowToken) => current.isValid(),
          onNightComplete: async (current: GameState) => {
            room.state = current;
            resolveNight(room);
          },
        },
      }, { type: next ?? "START_NIGHT" });
    }
  } else if (state.phase === "DAY_START") {
    await startDiscussion(room, signal);
  } else if (state.phase === "DAY_BADGE_SIGNUP") {
    const pending = state.players.filter((player) => player.alive && !player.isHuman &&
      state.badge.signup[player.playerId] === undefined);
    if (pending.length) {
      countCall(room);
      const signup = await generateAIBadgeSignupBatch(state, pending);
      signal?.throwIfAborted();
      room.state = { ...state, badge: { ...state.badge, signup: { ...state.badge.signup, ...signup } } };
    }
    const candidates = room.state.players.filter((player) => player.alive && room.state.badge.signup[player.playerId]).map((player) => player.seat);
    if (candidates.length) startBadgeSpeech(room, candidates);
    else {
      room.state = addSystemMessage(room.state, t("badgePhase.noSignup"));
      room.state = { ...room.state, phase: "DAY_START" };
    }
  } else if (speechPhases.has(state.phase)) {
    const speaker = playerAt(state, state.currentSpeakerSeat ?? -1);
    if (room.pendingAdvance) {
      room.pendingAdvance = false;
      if (state.phase === "DAY_LAST_WORDS") await afterLastWords(room, signal);
      else await advanceSpeaker(room, signal);
    } else if (speaker && !speaker.isHuman) {
      countCall(room);
      const segments = await generateAISpeechSegmentsStream(state, speaker, {
        signal,
        onPartialSegment: (text, index) => emit(speaker.displayName, index, text),
        onSegmentReceived: (text, index) => emit(speaker.displayName, index, text),
      });
      signal?.throwIfAborted();
      for (const segment of segments) {
        room.state = addPlayerMessage(room.state, speaker.playerId, segment, { isLastWords: state.phase === "DAY_LAST_WORDS" });
      }
      if (state.phase === "DAY_LAST_WORDS") await afterLastWords(room, signal);
      else await advanceSpeaker(room, signal);
    } else return false;
  } else if (state.phase === "DAY_BADGE_ELECTION") {
    const candidates = state.badge.candidates;
    const voter = state.players.find((player) => player.alive && !player.isHuman &&
      !candidates.includes(player.seat) && state.badge.votes[player.playerId] === undefined);
    if (voter) {
      countCall(room);
      const seat = await generateAIBadgeVote(state, voter).catch(() => BADGE_VOTE_ABSTAIN);
      signal?.throwIfAborted();
      room.state = { ...state, badge: { ...state.badge, votes: {
        ...state.badge.votes, [voter.playerId]: candidates.includes(seat) ? seat : BADGE_VOTE_ABSTAIN,
      } } };
    } else resolveBadgeElection(room);
  } else if (state.phase === "DAY_VOTE") {
    const pk = state.pkSource === "vote" ? state.pkTargets ?? [] : [];
    const voter = state.players.find((player) => player.alive && !player.isHuman &&
      !pk.includes(player.seat) && state.votes[player.playerId] === undefined);
    if (voter) {
      countCall(room);
      const vote = await generateAIVote(state, voter);
      signal?.throwIfAborted();
      room.state = { ...state,
        votes: { ...state.votes, [voter.playerId]: vote.seat },
        voteReasons: { ...state.voteReasons, [voter.playerId]: vote.reason },
      };
    } else await resolveVotes(room, signal);
  } else if (state.phase === "BADGE_TRANSFER") {
    const after = room.afterBadgeTransfer;
    room.afterBadgeTransfer = undefined;
    room.badgeTransferred = false;
    if (after === "after-vote") await afterLastWords(room, signal);
    else if (after === "after-night") await resumeAfterNightBadgeTransfer(room, signal);
    else if (after === "after-night-hunter") await startDiscussion(room, signal, true);
    else if (after === "after-vote-hunter") await proceedNight(room);
    else return false;
    room.deadSheriffSeat = undefined;
  } else if (state.phase === "HUNTER_SHOOT") {
    const pending = room.pendingHunter;
    if (!pending) return false;
    const hunter = playerAt(state, pending.seat);
    if (!hunter) return false;
    if (!hunter.isHuman) {
      countCall(room);
      const seat = await generateHunterShoot(state, hunter);
      signal?.throwIfAborted();
      await finishHunter(room, seat ?? -1, signal);
    } else await finishHunter(room, room.hunterChoice ?? -1, signal);
  } else return false;
  room.updatedAt = Date.now();
  endIfHumanDead(room);
  return true;
}

export function publicView(room: Room): { state: GameState; canAct: boolean } {
  const human = me(room);
  const state = structuredClone(room.state);
  for (const player of state.players) {
    if (player.isHuman) continue;
    delete player.agentProfile;
    if (state.phase !== "GAME_END" && !(isWolfRole(human.role) && isWolfRole(player.role))) {
      player.role = "Villager";
      player.alignment = "village";
    }
  }
  state.events = [];
  delete state.nightActions.pendingWolfVictim;
  delete state.nightActions.pendingPoisonVictim;
  if (state.phase !== "GAME_END") {
    state.nightHistory = Object.fromEntries(Object.entries(state.nightHistory ?? {}).map(([day, record]) => [
      day, record.resultsAnnounced ? { resultsAnnounced: true, deaths: record.deaths } : { resultsAnnounced: false },
    ]));
  }
  if (human.role !== "Seer") {
    delete state.nightActions.seerHistory;
    delete state.nightActions.seerResult;
    delete state.nightActions.seerTarget;
  }
  if (human.role !== "Witch") {
    delete state.nightActions.witchSave;
    delete state.nightActions.witchPoison;
    state.roleAbilities.witchHealUsed = false;
    state.roleAbilities.witchPoisonUsed = false;
  }
  if (!isWolfRole(human.role) && human.role !== "Witch") delete state.nightActions.wolfTarget;
  if (!isWolfRole(human.role)) delete state.nightActions.wolfVotes;
  if (state.phase === "DAY_VOTE") state.votes = Object.fromEntries(Object.entries(state.votes).filter(([id]) => id === human.playerId));
  if (state.phase === "DAY_BADGE_ELECTION") state.badge.votes = Object.fromEntries(Object.entries(state.badge.votes).filter(([id]) => id === human.playerId));
  return { state, canAct: waitingForHuman(room) };
}
