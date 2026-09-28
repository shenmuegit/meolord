import assert from "node:assert/strict";
import { createInitialGameState } from "../src/vendor/wolfcha/lib/game-master";
import { sampleModelRefs } from "../src/vendor/wolfcha/lib/character-generator";
import { isRestorableGameState } from "../src/vendor/wolfcha/store/game-machine";

const state = createInitialGameState();
assert.equal(isRestorableGameState(state), false);
assert.equal(isRestorableGameState({ ...state, phase: "NIGHT_START", gameSessionId: null }), true);
assert.equal(isRestorableGameState({ ...state, phase: "NIGHT_START", gameId: "" }), false);
assert.equal(isRestorableGameState({ ...state, phase: "GAME_END" }), false);

const models = sampleModelRefs(7);
assert.equal(models.length, 7);
assert.deepEqual(new Set(models.map((ref) => ref.model)), new Set(["mimo-v2.6-pro", "deepseek-flash"]));
assert.deepEqual(sampleModelRefs(0), []);
console.log("PASS: anonymous checkpoints and both configured player models");
