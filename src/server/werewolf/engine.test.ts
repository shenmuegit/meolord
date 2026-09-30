import assert from "node:assert/strict";
import test from "node:test";
import { act, publicView, step, type Room } from "./engine";
import { createInitialGameState, setupPlayers } from "@/vendor/wolfcha/lib/game-master";
import { isWolfRole, type Role } from "@/vendor/wolfcha/types/game";

function roomWithRoles(roles: Role[]): Room {
  const characters = Array.from({ length: 7 }, (_, index) => ({
    displayName: "玩家" + (index + 2),
    persona: { voiceRules: [], mbti: "INTJ", gender: "male" as const, age: 25 },
  }));
  return {
    token: "test",
    state: {
      ...createInitialGameState(),
      players: setupPlayers(characters, 0, "测试玩家", 8, roles),
      phase: "NIGHT_START",
      day: 1,
    },
    revealed: false,
    aiCalls: 0,
    updatedAt: Date.now(),
  };
}

test("only the seated human can act; other roles stay hidden", () => {
  const room = roomWithRoles(["Seer", "Werewolf", "Werewolf", "Werewolf", "Witch", "Hunter", "Villager", "Villager"]);
  const before = room.state.messages.length;
  assert.equal(act(room, { type: "speech", text: "越权发言" }), false);
  assert.equal(room.state.messages.length, before);
  const view = publicView(room);
  for (const player of view.state.players.filter((p) => !p.isHuman)) {
    assert.equal(player.agentProfile, undefined);
    assert.equal(player.role, "Villager");
  }
  assert.equal(act(room, { type: "reveal" }), true);
  assert.equal(act(room, { type: "reveal" }), false);
  assert.equal(act(room, { type: "speech", text: "仍未轮到我" }), false);
  assert.equal(room.aiCalls, 0);
});

test("one sheriff candidate is elected without an AI vote", async () => {
  const room = roomWithRoles(["Seer", "Werewolf", "Werewolf", "Werewolf", "Witch", "Hunter", "Villager", "Villager"]);
  room.state = {
    ...room.state, phase: "DAY_BADGE_SPEECH", daySpeechStartSeat: 0, currentSpeakerSeat: 0,
    badge: { ...room.state.badge, candidates: [0], signup: { [room.state.players[0].playerId]: true } },
  };
  room.pendingAdvance = true;
  assert.equal(await step(room), true);
  assert.equal(room.state.badge.holderSeat, 0);
  assert.equal(room.state.phase, "DAY_START");
  assert.equal(room.aiCalls, 0);
});

test("tied execution enters Wolfcha's PK speech and keeps the vote snapshot", async () => {
  const room = roomWithRoles(["Seer", "Werewolf", "Werewolf", "Werewolf", "Witch", "Hunter", "Villager", "Villager"]);
  const votes = Object.fromEntries(room.state.players.map((player, index) => [player.playerId, index < 4 ? 2 : 3]));
  room.state = { ...room.state, phase: "DAY_VOTE", votes };
  assert.equal(await step(room), true);
  assert.equal(room.state.phase, "DAY_PK_SPEECH");
  assert.deepEqual(room.state.pkTargets, [2, 3]);
  assert.equal(room.state.voteRounds?.at(-1)?.outcome, "tie");
  assert.ok(room.state.voteHistory[1]);
});

test("night deaths remain hidden until the badge election finishes", async () => {
  const room = roomWithRoles(["Seer", "Werewolf", "Werewolf", "Werewolf", "Witch", "Hunter", "Villager", "Villager"]);
  room.state = {
    ...room.state, phase: "NIGHT_SEER_ACTION",
    nightActions: { wolfTarget: 6, seerTarget: 1, seerResult: { targetSeat: 1, isWolf: true },
      seerHistory: [{ day: 1, targetSeat: 1, isWolf: true }] },
  };
  room.nextNight = "RESOLVE_NIGHT";
  assert.equal(await step(room), true);
  assert.equal(room.state.phase, "DAY_BADGE_SIGNUP");
  assert.equal(room.state.players[6].alive, true);
  assert.equal(room.state.nightHistory?.[1]?.resultsAnnounced, false);
  assert.equal(room.state.nightActions.pendingWolfVictim, 6);
  assert.equal(publicView(room).state.nightHistory?.[1]?.deaths, undefined);
  assert.equal(publicView(room).state.nightActions.pendingWolfVictim, undefined);
  assert.equal(isWolfRole(room.state.players[1].role), true);
});

test("badge transfer resumes the announced day without repeating the night result", async () => {
  const room = roomWithRoles(["Seer", "Villager", "Werewolf", "Werewolf", "Werewolf", "Hunter", "Witch", "Villager"]);
  room.state = {
    ...room.state,
    phase: "BADGE_TRANSFER",
    players: room.state.players.map((player) => player.seat === 1 ? { ...player, alive: false } : player),
    badge: { ...room.state.badge, holderSeat: null },
    nightHistory: { 1: { deaths: [{ seat: 1, reason: "wolf" }], resultsAnnounced: true } },
  };
  room.afterBadgeTransfer = "after-night";
  room.deadSheriffSeat = 1;
  assert.equal(await step(room), true);
  assert.equal(room.state.phase, "DAY_SPEECH");
  assert.equal(room.state.currentSpeakerSeat, 2);
  assert.equal(room.state.messages.some((message) => message.content.includes("平安夜")), false);
});
