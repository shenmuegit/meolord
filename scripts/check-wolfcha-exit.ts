import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createStore, Provider } from "jotai";
import { NextIntlClientProvider } from "next-intl";
import { useGameLogic } from "../src/vendor/wolfcha/hooks/useGameLogic";
import { useSpecialEvents } from "../src/vendor/wolfcha/hooks/game-phases/useSpecialEvents";
import { useBadgePhase } from "../src/vendor/wolfcha/hooks/game-phases/useBadgePhase";
import { DaySpeechPhase } from "../src/vendor/wolfcha/game/phases/DaySpeechPhase";
import { VotePhase } from "../src/vendor/wolfcha/game/phases/VotePhase";
import { createInitialGameState } from "../src/vendor/wolfcha/lib/game-master";
import { AsyncFlowController } from "../src/vendor/wolfcha/lib/game-flow-controller";
import { gameStateAtom } from "../src/vendor/wolfcha/store/game-machine";
import type { GameState, Role } from "../src/vendor/wolfcha/types/game";
import messages from "../src/vendor/wolfcha/i18n/messages/zh.json";

function table(): GameState {
  const roles: Role[] = ["Villager", "Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager"];
  return {
    ...createInitialGameState(), day: 1,
    players: roles.map((role, seat) => ({
      playerId: String(seat), seat, displayName: String(seat + 1),
      isHuman: seat === 0, alive: true, role,
      alignment: role === "Werewolf" ? "wolf" : "village",
      agentProfile: {
        modelRef: { provider: "mimo", model: "mimo-v2.6-pro" },
        persona: { voiceRules: [], mbti: "INTJ", gender: "male", age: 25 },
      },
    })),
  };
}

function renderHook<T>(store: ReturnType<typeof createStore>, hook: () => T): T {
  let value!: T;
  function Capture() { value = hook(); return null; }
  renderToString(createElement(Provider, { store },
    createElement(NextIntlClientProvider, { locale: "zh", timeZone: "UTC", messages, children: createElement(Capture) })));
  return value;
}

const scenarios: Array<{
  name: string;
  prepare: (state: GameState) => void;
  act: (game: ReturnType<typeof useGameLogic>) => Promise<void>;
}> = [
  {
    name: "last daytime vote",
    prepare: (state) => { state.phase = "DAY_VOTE"; state.votes = Object.fromEntries(state.players.slice(1).map((p) => [p.playerId, 1])); },
    act: (game) => game.handleHumanVote(1),
  },
  {
    name: "last sheriff vote",
    prepare: (state) => { state.phase = "DAY_BADGE_ELECTION"; state.badge.candidates = [1, 2]; state.badge.votes = Object.fromEntries(state.players.slice(3).map((p) => [p.playerId, 1])); },
    act: (game) => game.handleHumanVote(1),
  },
  {
    name: "sheriff signup",
    prepare: (state) => { state.phase = "DAY_BADGE_SIGNUP"; state.badge.signup = Object.fromEntries(state.players.slice(1).map((p) => [p.playerId, false])); },
    act: (game) => game.handleBadgeSignup(false),
  },
  {
    name: "human wolf target",
    prepare: (state) => { state.phase = "NIGHT_WOLF_ACTION"; state.players[0].role = "Werewolf"; state.players[0].alignment = "wolf"; },
    act: (game) => game.handleNightAction(7),
  },
  {
    name: "human witch action",
    prepare: (state) => { state.phase = "NIGHT_WITCH_ACTION"; state.players[0].role = "Witch"; },
    act: (game) => game.handleNightAction(-1, "pass"),
  },
  {
    name: "human hunter continuation",
    prepare: (state) => { state.phase = "HUNTER_SHOOT"; state.players[0].role = "Hunter"; state.players[0].alive = false; },
    act: (game) => game.handleNightAction(-1),
  },
];

async function main() {
  const failures: unknown[] = [];
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("Exit checks must not call a model"); };
  try {
    for (const scenario of scenarios) {
      const store = createStore();
      const state = table();
      scenario.prepare(state);
      store.set(gameStateAtom, state);
      const game = renderHook(store, useGameLogic);
      const pending = scenario.act(game);
      game.restartGame();
      const exited = store.get(gameStateAtom);
      let writes = 0;
      const unsubscribe = store.sub(gameStateAtom, () => { writes += 1; });
      await pending;
      unsubscribe();
      try {
        assert.equal(store.get(gameStateAtom).phase, "LOBBY", scenario.name);
        assert.equal(store.get(gameStateAtom).gameId, exited.gameId, scenario.name);
        assert.equal(writes, 0, `${scenario.name}: no stale state writes after exit`);
        console.log(`PASS: exit during ${scenario.name}`);
      } catch (error) { failures.push(error); }
    }

    // A summary can finish after cancellation; its old final state must be discarded.
    const store = createStore();
    const state = table();
    state.phase = "DAY_RESOLVE";
    store.set(gameStateAtom, state);
    const flow = new AsyncFlowController();
    let finishSummary!: (state: GameState) => void;
    const summary = new Promise<GameState>((resolve) => { finishSummary = resolve; });
    const callbacks = {
      setDialogue: () => {}, setIsWaitingForAI: () => {}, waitForUnpause: async () => {},
      getToken: () => flow.getToken(), isTokenValid: (token: ReturnType<typeof flow.getToken>) => token.isValid(),
      prepareFinalState: () => summary,
    };
    const events = renderHook(store, () => useSpecialEvents(callbacks));
    const ending = events.endGame(state, "village");
    flow.interrupt();
    const fresh = createInitialGameState();
    store.set(gameStateAtom, fresh);
    finishSummary(state);
    await ending;
    try {
      assert.equal(store.get(gameStateAtom), fresh, "A cancelled summary must not restore GAME_END");
      console.log("PASS: exit while preparing the final summary");
    } catch (error) { failures.push(error); }

    // Dawn announcements contain a delay before starting another player's turn.
    const day = new DaySpeechPhase();
    const dayFlow = new AsyncFlowController();
    let dayState = table();
    dayState.phase = "DAY_START";
    const pendingDay = day.handleAction({ state: dayState, phase: dayState.phase, extras: {
      token: dayFlow.getToken(), setGameState: (value: GameState) => { dayState = value; },
      setDialogue: () => {}, waitForUnpause: async () => {}, runAISpeech: async () => {},
      onBadgeTransfer: async () => {}, onHunterDeath: async () => {}, onGameEnd: async () => {},
      onStartVote: async () => {}, onBadgeSpeechEnd: async () => {}, onPkSpeechEnd: async () => {},
    } }, { type: "START_DAY_SPEECH_AFTER_BADGE" });
    dayFlow.interrupt();
    dayState = fresh;
    await pendingDay;
    try {
      assert.equal(dayState, fresh, "Dawn must not continue after exit");
      console.log("PASS: exit during dawn announcements");
    } catch (error) { failures.push(error); }
    for (const afterCounting of [false, true]) {
      const vote = new VotePhase();
      const voteFlow = new AsyncFlowController();
      let voteState = table();
      voteState.phase = "DAY_VOTE";
      voteState.votes = Object.fromEntries(voteState.players.map((p) => [p.playerId, p.seat % 2]));
      let dialogues = 0;
      const pendingVote = vote.handleAction({ state: voteState, phase: voteState.phase, extras: {
        token: voteFlow.getToken(), isTokenValid: (token: ReturnType<typeof voteFlow.getToken>) => token.isValid(),
        humanPlayer: voteState.players[0], setGameState: (value: GameState) => { voteState = value; },
        setDialogue: () => { dialogues += 1; }, setIsWaitingForAI: () => {}, waitForUnpause: async () => {},
        onVoteComplete: async () => {}, onGameEnd: async () => {}, runAISpeech: async () => {},
      } }, { type: "RESOLVE_VOTES" });
      if (afterCounting) await Promise.resolve();
      voteFlow.interrupt();
      voteState = fresh;
      dialogues = 0;
      await pendingVote;
      try {
        assert.equal(voteState, fresh, "A tied vote must not continue after exit");
        assert.equal(dialogues, 0, "A tied vote must not leave stale dialogue after exit");
        console.log(`PASS: exit ${afterCounting ? "after" : "before"} counting a tied vote`);
      } catch (error) { failures.push(error); }
    }
    assert.equal(requests, 0, "No AI requests may start after exit");
    if (failures.length) throw new AggregateError(failures, "Exited games resumed");

    // Everyone can campaign, leaving no voters. The round must still finish.
    const badgeState = table();
    badgeState.phase = "DAY_BADGE_ELECTION";
    badgeState.badge.candidates = badgeState.players.map((player) => player.seat);
    store.set(gameStateAtom, badgeState);
    const completedElections: GameState[] = [];
    const badge = renderHook(store, () => useBadgePhase({
      ...callbacks, clearDialogue: () => {}, runAISpeech: async () => {},
      onBadgeElectionComplete: async (state) => { completedElections.push(state); },
      onBadgeTransferComplete: async () => {},
    }));
    await badge.startBadgeElectionPhase(badgeState);
    assert.equal(completedElections.length, 1, "All eight candidates must continue without an empty PK round");
    assert.equal(completedElections[0].badge.holderSeat, null);
    assert.equal(completedElections[0].voteRounds?.at(-1)?.outcome, "no-votes");
    console.log("PASS: all eight candidates continue without a sheriff");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
