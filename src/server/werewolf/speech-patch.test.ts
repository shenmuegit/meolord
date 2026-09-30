import assert from "node:assert/strict";
import test from "node:test";
import { speechPatch } from "./speech-patch";

test("speech stream sends only changes and reconstructs corrected text", () => {
  let received = "";
  for (const next of ["我", "我是", "我是3号", "我是 3 号", "我是 3 号"]) {
    const patch = speechPatch(received, next);
    if (!patch) continue;
    if (next === "我是3号") assert.deepEqual(patch, { from: 2, delta: "3号" });
    if (next === "我是 3 号") assert.deepEqual(patch, { from: 2, delta: " 3 号" });
    received = received.slice(0, patch.from) + patch.delta;
    assert.equal(received, next);
  }
  assert.equal(speechPatch(received, received), null);
});
