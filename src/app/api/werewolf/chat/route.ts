export const maxDuration = 300;

const providers = {
  "mimo-v2.6-pro": {
    url: "https://api.xiaomimimo.com/v1/chat/completions",
    key: () => process.env.MIMO_API_KEY,
    tokenLimit: "max_completion_tokens",
    authHeader: "api-key",
  },
  "deepseek-flash": {
    url: "https://api.deepseek.com/chat/completions",
    key: () => process.env.DEEPSEEK_API_KEY,
    tokenLimit: "max_tokens",
    authHeader: "Authorization",
  },
} as const;

type Model = keyof typeof providers;
type Message = { role: "system" | "user" | "assistant"; content: string };
type ChatRequest = {
  model: Model;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: {
    type?: string;
    json_schema?: { schema?: unknown };
  };
};

function normalizeMessages(value: unknown): Message[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const messages: Message[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { role, content } = item as Record<string, unknown>;
    if (role !== "system" && role !== "user" && role !== "assistant") return null;
    if (typeof content === "string") {
      messages.push({ role, content });
      continue;
    }
    // Wolfcha's cached system prompts are arrays of text parts. These providers
    // do not use the source project's cache_control metadata.
    if (!Array.isArray(content) || !content.every((part) =>
      part && typeof part === "object" && part.type === "text" && typeof part.text === "string"
    )) return null;
    messages.push({ role, content: content.map((part) => part.text).join("\n") });
  }
  return messages;
}

function requestBody(body: ChatRequest, messages: Message[]) {
  const format = body.response_format;
  const responseFormat = format?.type === "json_schema" || format?.type === "json_object"
    ? { type: "json_object" }
    : undefined;
  if (format?.type === "json_schema" && format.json_schema?.schema) {
    messages = [{
      role: "system",
      content: `只输出 JSON 对象，不要使用 Markdown 代码块。输出必须符合以下 JSON Schema：\n${JSON.stringify(format.json_schema.schema)}`,
    }, ...messages];
  }
  const provider = providers[body.model];
  return {
    model: body.model,
    messages,
    stream: body.stream === true,
    thinking: { type: "disabled" },
    ...(typeof body.temperature === "number" && Number.isFinite(body.temperature)
      ? { temperature: body.temperature } : {}),
    ...(typeof body.max_tokens === "number" && Number.isFinite(body.max_tokens)
      ? { [provider.tokenLimit]: Math.max(16, Math.floor(body.max_tokens)) } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as ChatRequest | null;
  if (!body || !Object.hasOwn(providers, body.model)) {
    return Response.json({ error: "Unknown model" }, { status: 400 });
  }
  const messages = normalizeMessages(body.messages);
  if (!messages) return Response.json({ error: "Invalid messages" }, { status: 400 });

  const provider = providers[body.model];
  const key = provider.key();
  if (!key) return Response.json({ error: "模型尚未配置" }, { status: 503 });

  try {
    const upstream = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [provider.authHeader]: provider.authHeader === "Authorization" ? `Bearer ${key}` : key,
      },
      body: JSON.stringify(requestBody(body, messages)),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]),
    });
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      const error = upstream.status === 429 ? "429 请求繁忙，请稍后重试"
        : upstream.status === 402 ? "[QUOTA_EXHAUSTED] 模型账户余额不足"
          : "模型请求失败，请重试";
      return Response.json({ error }, { status });
    }
    if (body.stream === true) {
      if (!upstream.body) return Response.json({ error: "模型没有返回流" }, { status: 502 });
      return new Response(upstream.body, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }
    return new Response(upstream.body, {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ error: timeout ? "模型请求超时" : "模型连接失败" }, { status: timeout ? 504 : 502 });
  }
}
