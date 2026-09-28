// Run with Node.js 24: node scripts/check-werewolf.mjs
import assert from "node:assert/strict";
import { POST } from "../src/app/api/werewolf/speech/route.ts";
const originalFetch = globalThis.fetch;
const previousKeys = [process.env.MIMO_API_KEY, process.env.DEEPSEEK_API_KEY];
const request = (body) => new Request("http://localhost/api/werewolf/speech", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

try {
  process.env.MIMO_API_KEY = "test-mimo-secret";
  process.env.DEEPSEEK_API_KEY = "test-deepseek-secret";
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    const mimo = String(url).startsWith("https://api.xiaomimimo.com/");
    assert.equal(String(url), mimo
      ? "https://api.xiaomimimo.com/v1/chat/completions"
      : "https://api.deepseek.com/chat/completions");
    const headers = new Headers(options.headers);
    assert.equal(headers.get(mimo ? "api-key" : "authorization"), mimo ? "test-mimo-secret" : "Bearer test-deepseek-secret");
    const body = JSON.parse(options.body);
    assert.equal(body.model, mimo ? "mimo-v2.6-pro" : "deepseek-flash");
    assert.equal(body.thinking.type, "disabled");
    assert.equal(body[mimo ? "max_completion_tokens" : "max_tokens"], 320);
    assert.ok(body.messages[1].content.includes("我怀疑 3 号"));
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: " 我想听听 3 号的解释。 " } }] });
  };

  for (const seat of [2, 3]) {
    const response = await POST(request({ seat, history: [{ seat: 1, text: "我怀疑 3 号" }] }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { seat, model: seat === 2 ? "mimo-v2.6-pro" : "deepseek-flash", text: "我想听听 3 号的解释。" });
  }
  assert.equal(calls, 2);
  for (const invalid of [
    { seat: 1, history: [] }, { seat: 10, history: [] },
    { seat: 2, history: [{ seat: 1, text: "x".repeat(1201) }] },
    { seat: 2, history: [{ seat: 1, text: "  " }] },
    { seat: 2, history: Array.from({ length: 73 }, () => ({ seat: 1, text: "hi" })) },
  ]) assert.equal((await POST(request(invalid))).status, 400);
  assert.equal((await POST(new Request("http://localhost", { method: "POST", body: "{" }))).status, 400);
  assert.equal(calls, 2, "Invalid requests must not call a paid provider");

  const valid = { seat: 2, history: [] };
  delete process.env.MIMO_API_KEY;
  assert.equal((await POST(request(valid))).status, 503);
  process.env.MIMO_API_KEY = "test-mimo-secret";
  globalThis.fetch = async () => new Response("test-mimo-secret", { status: 401 });
  const failure = await POST(request(valid));
  assert.equal(failure.status, 502);
  assert.ok(!(await failure.text()).includes("test-mimo-secret"), "Provider errors must not expose secrets");
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: "" } }] });
  assert.equal((await POST(request(valid))).status, 502);
  globalThis.fetch = async () => { throw new DOMException("Timed out", "TimeoutError"); };
  assert.equal((await POST(request(valid))).status, 504);
  console.log("PASS: both providers, input limits, missing keys, safe errors, empty replies and timeout");
} finally {
  globalThis.fetch = originalFetch;
  for (const [index, name] of ["MIMO_API_KEY", "DEEPSEEK_API_KEY"].entries()) {
    if (previousKeys[index] === undefined) delete process.env[name];
    else process.env[name] = previousKeys[index];
  }
}
