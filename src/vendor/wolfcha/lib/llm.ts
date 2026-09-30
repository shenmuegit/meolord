// Adapted from oil-oil/wolfcha for Meolord; see src/vendor/wolfcha/UPSTREAM.md.
import type { ModelRef } from "../types/game";
import { parseLLMJson } from "./llm-json";

export type LLMContentPart =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral"; ttl?: "1h" } }
  | { type: "image_url"; image_url: { url: string; detail?: string } }
  | { type: "input_audio"; input_audio: { data: string; format: "mp3" | "wav" } };

export type ApiKeySource = "user" | "project";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | LLMContentPart[];
  reasoning_details?: unknown;
}

export interface ChatCompletionResponse {
  id: string;
  choices: {
    message: { role: "assistant"; content: string; reasoning_details?: unknown };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
  };
}

export interface PromptCacheUsage {
  promptCacheInputTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  promptCacheHitRatio: number;
  source: "prompt_cache_hit_tokens" | "prompt_tokens_details.cached_tokens" | "none";
}

export function extractPromptCacheUsage(usage: ChatCompletionResponse["usage"] | undefined): PromptCacheUsage {
  const promptTokens = typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const hit = typeof usage?.prompt_cache_hit_tokens === "number"
    ? Math.max(0, usage.prompt_cache_hit_tokens)
    : typeof usage?.prompt_tokens_details?.cached_tokens === "number"
      ? Math.max(0, usage.prompt_tokens_details.cached_tokens)
      : 0;
  const miss = typeof usage?.prompt_cache_miss_tokens === "number"
    ? Math.max(0, usage.prompt_cache_miss_tokens)
    : Math.max(0, promptTokens - hit);
  const input = hit + miss || promptTokens;
  return {
    promptCacheInputTokens: input,
    promptCacheHitTokens: hit,
    promptCacheMissTokens: miss,
    promptCacheHitRatio: input > 0 ? hit / input : 0,
    source: typeof usage?.prompt_cache_hit_tokens === "number"
      ? "prompt_cache_hit_tokens"
      : typeof usage?.prompt_tokens_details?.cached_tokens === "number"
        ? "prompt_tokens_details.cached_tokens" : "none",
  };
}

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: { name: string; description?: string; strict?: boolean; schema: unknown } };

export interface ReasoningOptions {
  enabled: boolean;
  effort?: "minimal" | "low" | "medium" | "high";
  max_tokens?: number;
}

export interface GenerateOptions {
  signal?: AbortSignal;
  model: string;
  provider?: ModelRef["provider"];
  promptScope?: "gameplay" | "utility";
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  reasoning?: ReasoningOptions;
  reasoning_effort?: "minimal" | "low" | "medium" | "high";
  reasoningProfile?: "decision";
  response_format?: ResponseFormat;
}

export function mergeOptionsFromModelRef<T extends GenerateOptions>(modelRef: ModelRef | undefined, options: T): T {
  if (!modelRef) return options;
  const out = { ...options } as T;
  out.provider = modelRef.provider;
  if (modelRef.temperature !== undefined) out.temperature = modelRef.temperature;
  const reasoning = options.reasoningProfile === "decision" && modelRef.decisionReasoning !== undefined
    ? modelRef.decisionReasoning : modelRef.reasoning ?? options.reasoning;
  if (reasoning !== undefined) out.reasoning = reasoning;
  return out;
}

export type BatchCompletionResult =
  | { ok: true; content: string; reasoning_details?: unknown; raw: ChatCompletionResponse }
  | { ok: false; error: string; status?: number };

export function resolveApiKeySource(_model: string): ApiKeySource {
  return "project";
}

const QUOTA_EXHAUSTED_MARKER = "[QUOTA_EXHAUSTED]";
const GAME_SESSION_EXPIRED_MARKER = "[GAME_SESSION_EXPIRED]";

export function isQuotaExhaustedMessage(message: string): boolean {
  return message.includes(QUOTA_EXHAUSTED_MARKER);
}

export function isGameSessionExpiredMessage(message: string): boolean {
  return message.includes(GAME_SESSION_EXPIRED_MARKER);
}

const REASONING_TAG_NAMES = ["think", "thinking", "analysis", "reasoning", "thought"];
const REASONING_TAG_PATTERN = REASONING_TAG_NAMES.join("|");

export function stripReasoningArtifacts(text: string): string {
  return stripReasoningArtifactsPreserveWhitespace(text).trim();
}

function stripReasoningArtifactsPreserveWhitespace(text: string): string {
  if (!text) return text;
  return text
    .replace(new RegExp(`<\\s*(${REASONING_TAG_PATTERN})\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>\\s*`, "gi"), "")
    .replace(new RegExp(`<\\s*\\/?\\s*(${REASONING_TAG_PATTERN})\\b[^>]*>`, "gi"), "");
}

function findReasoningEnd(text: string): { end: number } | null {
  const match = new RegExp(`<\\s*\\/\\s*(${REASONING_TAG_PATTERN})\\s*>`, "i").exec(text);
  return match ? { end: match.index + match[0].length } : null;
}

function couldBeReasoningStart(text: string): boolean {
  if (!text.startsWith("<")) return false;
  const lowered = text.toLowerCase();
  return REASONING_TAG_NAMES.some((name) => `<${name}`.startsWith(lowered) || lowered.startsWith(`<${name}`));
}

export function stripMarkdownCodeFences(text: string): string {
  let result = text.trim();
  if (result.startsWith("```")) {
    result = result.replace(/^```[a-zA-Z0-9_-]*\s*/m, "").replace(/\s*```\s*$/m, "");
  }
  return result.trim();
}

function requestBody(options: GenerateOptions, stream = false) {
  return {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens,
    stream,
    response_format: options.response_format,
  };
}

// ponytail: one table per page; scope the controller per table if that changes.
let gameRequestController = new AbortController();

export function beginGameRequests(): void {
  gameRequestController.abort();
  gameRequestController = new AbortController();
}

export function cancelGameRequests(): void {
  gameRequestController.abort();
}

async function request(options: GenerateOptions, stream = false): Promise<Response> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, gameRequestController.signal])
    : gameRequestController.signal;
  signal.throwIfAborted();
  // The browser can never submit model messages. Only the server-side game
  // runner imports this transport after a room has authorized the next step.
  if (typeof window !== "undefined") throw new Error("模型只能由服务端对局调用");
  const provider = options.model === "mimo-v2.6-pro"
    ? { url: "https://api.xiaomimimo.com/v1/chat/completions", key: process.env.MIMO_API_KEY, header: "api-key", tokenLimit: "max_completion_tokens" }
    : options.model === "deepseek-flash"
      ? { url: "https://api.deepseek.com/chat/completions", key: process.env.DEEPSEEK_API_KEY, header: "Authorization", tokenLimit: "max_tokens" }
      : null;
  if (!provider?.key) throw new Error(provider ? "模型尚未配置" : "Unknown model");
  const body = requestBody(options, stream);
  const messages = body.messages.map(({ role, content }) => ({
    role,
    content: typeof content === "string" ? content : content.map((part) => part.type === "text" ? part.text : "").join("\n"),
  }));
  if (body.response_format?.type === "json_schema") {
    messages.unshift({ role: "system", content: `只输出 JSON 对象，不要使用 Markdown 代码块。输出必须符合以下 JSON Schema：\n${JSON.stringify(body.response_format.json_schema.schema)}` });
  }
  const response = await fetch(provider.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [provider.header]: provider.header === "Authorization" ? `Bearer ${provider.key}` : provider.key,
    },
    signal,
    body: JSON.stringify({
      model: body.model,
      messages,
      stream,
      thinking: { type: "disabled" },
      temperature: body.temperature,
      ...(typeof body.max_tokens === "number" ? { [provider.tokenLimit]: Math.max(16, Math.floor(body.max_tokens)) } : {}),
      ...(body.response_format?.type === "json_schema" || body.response_format?.type === "json_object"
        ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    const error = new Error(payload?.error || `模型请求失败 (${response.status})`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response;
}

export async function generateCompletion(
  options: GenerateOptions,
): Promise<{ content: string; reasoning_details?: unknown; raw: ChatCompletionResponse }> {
  const response = await request(options);
  const raw = await response.json() as ChatCompletionResponse;
  options.signal?.throwIfAborted();
  const message = raw.choices?.[0]?.message;
  if (typeof message?.content !== "string") throw new Error("模型没有返回有效内容");
  return {
    content: stripReasoningArtifacts(message.content),
    reasoning_details: message.reasoning_details,
    raw,
  };
}

export async function generateCompletionBatch(requests: GenerateOptions[]): Promise<BatchCompletionResult[]> {
  return Promise.all(requests.map(async (options): Promise<BatchCompletionResult> => {
    try {
      return { ok: true, ...await generateCompletion(options) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        status: error && typeof error === "object" && "status" in error && typeof error.status === "number"
          ? error.status : undefined,
      };
    }
  }));
}

export function readStreamProtocolError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return null;
  const raw = (payload as { error: unknown }).error;
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "message" in raw && typeof raw.message === "string") return raw.message;
  return "模型流式响应失败";
}

export async function* generateCompletionStream(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
  const response = await request(options, true);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = false;
  let thinkStripped = false;
  let thinkBuffer = "";

  const parseLine = (line: string): { done: boolean; content: string } => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) return { done: false, content: "" };
    if (!trimmed.startsWith("data:")) return { done: false, content: "" };
    const data = trimmed.slice(5).trimStart();
    if (data === "[DONE]") return { done: true, content: "" };
    let payload: unknown;
    try { payload = JSON.parse(data); }
    catch { throw new Error("模型流式响应包含无法解析的 SSE 数据帧"); }
    const protocolError = readStreamProtocolError(payload);
    if (protocolError) throw new Error(protocolError);
    if (!payload || typeof payload !== "object" || !("choices" in payload)) return { done: false, content: "" };
    const choices = (payload as { choices: unknown }).choices;
    const first = Array.isArray(choices) ? choices[0] : null;
    const delta = first && typeof first === "object" && "delta" in first ? first.delta : null;
    const content = delta && typeof delta === "object" && "content" in delta ? delta.content : null;
    return { done: false, content: typeof content === "string" ? content : "" };
  };

  const cleanDelta = (delta: string): string => {
    if (!delta) return "";
    if (thinkStripped) return stripReasoningArtifactsPreserveWhitespace(delta);
    thinkBuffer += delta;
    const reasoningEnd = findReasoningEnd(thinkBuffer);
    if (reasoningEnd) {
      const after = stripReasoningArtifactsPreserveWhitespace(thinkBuffer.slice(reasoningEnd.end).replace(/^\n+/, ""));
      thinkStripped = true;
      thinkBuffer = "";
      return after;
    }
    if (!couldBeReasoningStart(thinkBuffer)) {
      thinkStripped = true;
      const cleaned = stripReasoningArtifactsPreserveWhitespace(thinkBuffer);
      thinkBuffer = "";
      return cleaned;
    }
    return "";
  };

  try {
    while (!complete) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("模型流式响应超时")), 45_000);
      });
      let read: ReadableStreamReadResult<Uint8Array>;
      try { read = await Promise.race([reader.read(), idle]); }
      finally { if (timeout) clearTimeout(timeout); }
      if (read.done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          const parsed = parseLine(buffer);
          complete = parsed.done;
          const cleaned = cleanDelta(parsed.content);
          if (cleaned) yield cleaned;
        }
        break;
      }
      buffer += decoder.decode(read.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const parsed = parseLine(line);
        if (parsed.done) { complete = true; break; }
        const cleaned = cleanDelta(parsed.content);
        if (cleaned) yield cleaned;
      }
    }
    if (!complete) throw new Error("模型流式响应在 [DONE] 前意外结束");
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function generateJSON<T>(options: GenerateOptions & { schema?: string }): Promise<T> {
  const messages = options.messages.map((message) => ({
    ...message,
    content: typeof message.content === "string" ? message.content : message.content.map((part) => ({ ...part })),
  }));
  const last = messages.at(-1);
  const suffix = "\n\nRespond with valid JSON only. No markdown, no code blocks, just raw JSON.";
  if (last?.role === "user") {
    if (typeof last.content === "string") last.content += suffix;
    else {
      const lastText = [...last.content].reverse().find((part) => part.type === "text");
      if (lastText?.type === "text") lastText.text += suffix;
      else last.content.push({ type: "text", text: suffix });
    }
  }
  const result = await generateCompletion({
    ...options,
    messages,
    response_format: options.response_format ?? { type: "json_object" },
  });
  const cleaned = stripMarkdownCodeFences(result.content);
  const parsed = parseLLMJson<T>(cleaned);
  if (parsed === null) throw new Error("模型未返回有效 JSON");
  return parsed;
}
