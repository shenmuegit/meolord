// Run while the local Next.js and Werewolf Durable Object dev servers are running.
import assert from "node:assert/strict";

const url = process.env.WEREWOLF_TEST_URL ?? "http://127.0.0.1:3012/api/werewolf/game";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname));

const started = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind: "start", name: "本地验证" }),
});
assert.equal(started.status, 200, "Local starts must not share a depleted production IP rate bucket");
assert.match(started.headers.get("content-type") ?? "", /text\/event-stream/);

const cookie = started.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie?.startsWith("werewolf_room="));
try {
  const reader = started.body.getReader();
  const decoder = new TextDecoder();
  const names = new Map();
  let buffer = "";
  let humanSeat = -1;
  let firstCharacterRead = -1;
  let readyRead = -1;
  let readCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    readCount++;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((part) => part.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "seating") humanSeat = event.humanSeat;
      if (event.type === "reset") names.clear();
      if (event.type === "character") {
        names.set(event.seat, event.name);
        if (firstCharacterRead === -1) firstCharacterRead = readCount;
      }
      if (event.type === "ready") {
        readyRead = readCount;
        assert.equal(event.state.players.length, 8);
        for (const [seat, name] of names) assert.equal(event.state.players[seat].displayName, name);
      }
    }
  }
  assert.ok(humanSeat >= 0 && humanSeat < 8);
  assert.equal(names.size, 7);
  assert.ok(firstCharacterRead > 0 && firstCharacterRead < readyRead, "Characters must arrive before the finished room, in separate network reads");
  const state = await fetch(url, { headers: { Cookie: cookie } });
  assert.equal(state.status, 200);
  assert.equal((await state.json()).state.players.length, 8);
} finally {
  const left = await fetch(url, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(left.status, 200);
}
console.log("PASS: seven characters arrived progressively before room completion; state and leave work");
