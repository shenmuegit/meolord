// Run against the local Next.js and Durable Object servers to check a real model speech.
import assert from "node:assert/strict";

const url = process.env.WEREWOLF_TEST_URL ?? "http://127.0.0.1:3012/api/werewolf/game";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname));
let cookie = "";
let speechFrames = 0;
let savedParagraphs = 0;
const fullDay = process.env.WEREWOLF_TEST_FULL_DAY === "1";

async function request(body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${body.kind}: ${response.status} ${await response.text()}`);
  if (body.kind !== "step" && body.kind !== "start") return { response, view: await response.json() };
  let view;
  const streamedParagraphs = [];
  for (const frame of (await response.text()).split("\n\n")) {
    const line = frame.split("\n").find((part) => part.startsWith("data: "));
    if (!line) continue;
    const event = JSON.parse(line.slice(6));
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "speech") {
      speechFrames++;
      streamedParagraphs[event.index] = (streamedParagraphs[event.index] ?? "").slice(0, event.from) + event.delta;
    }
    if (event.type === "state" || event.type === "ready") view = event;
  }
  assert.ok(view);
  return { response, view, streamedParagraphs };
}

try {
  const started = await request({ kind: "start", name: "原版流程验收" });
  cookie = started.response.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.ok(cookie.startsWith("werewolf_room="));
  let { view } = started;
  for (let turn = 0; turn < 80; turn++) {
    if (fullDay ? view.state.day > 1 || view.state.phase === "GAME_END" :
      view.state.messages.some((message) => !message.isSystem &&
      view.state.players.some((player) => !player.isHuman && player.playerId === message.playerId))) break;
    const { state } = view;
    const previousMessageCount = state.messages.length;
    let action;
    if (view.canAct) {
      const human = state.players.find((player) => player.isHuman);
      const target = state.players.find((player) => player.alive && !player.isHuman)?.seat;
      if (state.phase === "NIGHT_START") action = { type: "reveal" };
      else if (state.phase === "NIGHT_WITCH_ACTION") action = { type: "night", seat: -1, choice: "pass" };
      else if (state.phase.startsWith("NIGHT_")) action = { type: "night", seat: target };
      else if (state.phase === "DAY_BADGE_SIGNUP") action = { type: "badge-signup", signup: false };
      else if (state.phase === "DAY_BADGE_ELECTION") action = { type: "vote", seat: state.badge.candidates[0] };
      else if (state.phase === "DAY_VOTE") action = { type: "vote", seat: state.pkTargets?.[0] ?? target };
      else if (state.phase === "HUNTER_SHOOT") action = { type: "hunter", seat: -1 };
      else if (state.phase === "BADGE_TRANSFER") action = { type: "badge-transfer", seat: -1 };
      else if (state.currentSpeakerSeat === human.seat) action = { type: "speech", text: "" };
      else throw new Error(`Unhandled human turn: ${state.phase}`);
      ({ view } = await request({ kind: "action", action }));
    } else {
      const result = await request({ kind: "step" });
      view = result.view;
      if (result.streamedParagraphs.length) {
        const paragraphs = view.state.messages.slice(previousMessageCount).filter((message) => !message.isSystem &&
          view.state.players.some((player) => !player.isHuman && player.playerId === message.playerId));
        assert.deepEqual(result.streamedParagraphs.filter(Boolean), paragraphs.map((message) => message.content));
        savedParagraphs += paragraphs.length;
      }
    }
    console.log(`${turn + 1}: ${view.state.phase}`);
  }
  assert.ok(speechFrames > 1, "AI speech must arrive in incremental SSE frames");
  assert.ok(savedParagraphs > 0, "AI speech paragraphs must be saved to game history");
  if (fullDay) assert.ok(view.state.day > 1 || view.state.winner, "The first round did not reach a result");
  console.log(`PASS: Wolfcha AI speech streamed in ${speechFrames} frames; ${savedParagraphs} paragraph(s) saved; day ${view.state.day}`);
} finally {
  if (cookie) await fetch(url, { method: "DELETE", headers: { Cookie: cookie } });
}
