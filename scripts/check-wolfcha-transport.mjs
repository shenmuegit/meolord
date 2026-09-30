// Run with Node.js 24: node scripts/check-wolfcha-transport.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { POST } from "../src/app/api/werewolf/chat/route.ts";

const source = readFileSync(new URL("../src/vendor/wolfcha/lib/llm.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const llm = {};
new Function("exports", "require", compiled)(llm, () => ({
  parseLLMJson: (text) => { try { return JSON.parse(text); } catch { return null; } },
}));

process.env.MIMO_API_KEY = "test-mimo-key";
process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
const originalFetch = globalThis.fetch;
const calls = [];
const sse = (frames) => new Response(new ReadableStream({
  start(controller) {
    const encoder = new TextEncoder();
    for (const frame of frames) controller.enqueue(encoder.encode(frame));
    controller.close();
  },
}), { headers: { "Content-Type": "text/event-stream" } });

try {
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const mimo = body.model === "mimo-v2.6-pro";
    assert.equal(url, mimo
      ? "https://api.xiaomimimo.com/v1/chat/completions"
      : "https://api.deepseek.com/chat/completions");
    assert.equal(new Headers(init.headers).get(mimo ? "api-key" : "authorization"),
      mimo ? "test-mimo-key" : "Bearer test-deepseek-key");
    assert.equal(body.thinking.type, "disabled");
    calls.push(body);
    const prompt = body.messages.at(-1).content;
    if (prompt.includes("rate-limit")) return Response.json({ error: "fixture" }, { status: 429 });
    if (prompt.includes("upstream-secret-error")) return new Response("test-deepseek-key", { status: 401 });
    if (body.stream) {
      if (prompt.includes("protocol-error")) return sse(['data: {"error":{"message":"stream failed"}}\n\n']);
      if (prompt.includes("truncated")) return sse(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n']);
      return sse([
        'data: {"choices":[{"delta":{"content":"<think>private</think>hello"}}]}\n',
        '\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ]);
    }
    return Response.json({ id: "fixture", choices: [{
      message: { role: "assistant", content: body.response_format ? '{"ok":true}' : "hello" },
      finish_reason: "stop",
    }] });
  };

  const invalid = await POST(new Request("http://localhost/api/werewolf/chat", {
    method: "POST", body: JSON.stringify({ model: "other", messages: [{ role: "user", content: "hi" }] }),
  }));
  assert.equal(invalid.status, 401);
  assert.equal(calls.length, 0);

  const options = { model: "mimo-v2.6-pro", messages: [{ role: "user", content: "hello" }], max_tokens: 320 };
  assert.equal((await llm.generateCompletion(options)).content, "hello");
  assert.equal(calls.at(-1).max_completion_tokens, 320);
  assert.ok(!("max_tokens" in calls.at(-1)));

  assert.deepEqual(await llm.generateJSON({ ...options, response_format: {
    type: "json_schema", json_schema: { name: "test", schema: { type: "object", properties: { ok: { type: "boolean" } } } },
  } }), { ok: true });
  assert.deepEqual(calls.at(-1).response_format, { type: "json_object" });
  assert.match(calls.at(-1).messages[0].content, /JSON Schema/);

  const batch = await llm.generateCompletionBatch([
    { model: "deepseek-flash", messages: [{ role: "user", content: "hello" }], max_tokens: 64 },
    { model: "deepseek-flash", messages: [{ role: "user", content: "rate-limit" }] },
  ]);
  assert.equal(batch[0].ok, true);
  assert.deepEqual([batch[1].ok, batch[1].status], [false, 429]);
  assert.equal(calls.at(-2).max_tokens, 64);

  const blocked = await POST(new Request("http://localhost/api/werewolf/chat", {
    method: "POST", body: JSON.stringify({ model: "deepseek-flash", messages: [{ role: "user", content: "upstream-secret-error" }] }),
  }));
  assert.equal(blocked.status, 401);
  assert.ok(!(await blocked.text()).includes("test-deepseek-key"));

  const chunks = [];
  for await (const chunk of llm.generateCompletionStream(options)) chunks.push(chunk);
  assert.equal(chunks.join(""), "hello world");
  for (const [prompt, pattern] of [["protocol-error", /stream failed/], ["truncated", /\[DONE\]/]]) {
    await assert.rejects(async () => {
      for await (const _ of llm.generateCompletionStream({ ...options, messages: [{ role: "user", content: prompt }] })) {
        // Consume the stream so protocol completion is checked.
      }
    }, pattern);
  }
  assert.equal(llm.isQuotaExhaustedMessage("[QUOTA_EXHAUSTED] balance"), true);
  console.log("PASS: fixed models, server keys, JSON format, batch errors, SSE and protocol failures");

  // Leaving the table must cancel parallel work and prevent late requests.
  const pendingSignals = [];
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    pendingSignals.push(init.signal);
    init.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });
  const pending = Promise.allSettled([
    llm.generateCompletion(options),
    llm.generateCompletionStream(options).next(),
  ]);
  llm.cancelGameRequests?.();
  assert.deepEqual(pendingSignals.map((signal) => signal?.aborted ?? false), [true, true],
    "Exiting the table must abort both regular and streaming requests");
  assert.deepEqual((await pending).map((result) => result.status), ["rejected", "rejected"]);
  await assert.rejects(llm.generateCompletion(options), { name: "AbortError" });
  assert.equal(pendingSignals.length, 2, "Exited games must not send another request");

  llm.beginGameRequests?.();
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.signal.aborted, false);
    return Response.json({ choices: [{ message: { role: "assistant", content: "new game" } }] });
  };
  assert.equal((await llm.generateCompletion(options)).content, "new game");
  console.log("PASS: leaving cancels all requests; a new game can start cleanly");
} finally {
  globalThis.fetch = originalFetch;
}
