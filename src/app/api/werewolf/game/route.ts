import { getCloudflareContext } from "@opennextjs/cloudflare";

export const maxDuration = 300;

type Stub = { fetch(request: Request): Promise<Response> };
type RoomNamespace = { getByName(name: string): Stub };

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

function rooms(): RoomNamespace {
  return (getCloudflareContext().env as unknown as { WEREWOLF_ROOMS: RoomNamespace }).WEREWOLF_ROOMS;
}

function activeRoom(request: Request): { stub: Stub; token: string } | null {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("werewolf_room="));
  const value = cookie?.slice("werewolf_room=".length);
  if (!value) return null;
  const [id, token] = value.split(".");
  if (!/^[0-9a-f-]{36}$/.test(id ?? "") || !/^[0-9a-f-]{72}$/.test(token ?? "")) return null;
  return { stub: rooms().getByName("game:" + id), token };
}

async function forward(stub: Stub, path: string, token: string, body?: unknown): Promise<Response> {
  const response = await stub.fetch(new Request("https://room" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-Game-Token": token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  return new Response(response.body, { status: response.status, headers: response.headers });
}

export async function GET(request: Request) {
  const room = activeRoom(request);
  return room ? forward(room.stub, "/state", room.token) : unauthorized();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { kind?: unknown; name?: unknown; action?: unknown } | null;
  if (body?.kind === "start") {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 24) return unauthorized();
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) {
      const allowed = await rooms().getByName("rate:" + ip).fetch(new Request("https://room/allow-start", { method: "POST" }));
      if (!allowed.ok) return unauthorized();
    } else if (process.env.NODE_ENV !== "development" || !["localhost", "127.0.0.1"].includes(new URL(request.url).hostname)) {
      return unauthorized();
    }
    const id = crypto.randomUUID();
    const token = crypto.randomUUID() + crypto.randomUUID();
    const response = await rooms().getByName("game:" + id).fetch(new Request("https://room/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: body.name, token }),
    }));
    if (!response.ok) return new Response(response.body, { status: response.status, headers: response.headers });
    const headers = new Headers(response.headers);
    headers.set("Set-Cookie", "werewolf_room=" + id + "." + token + "; Path=/api/werewolf; HttpOnly; SameSite=Strict; Max-Age=3600" + (new URL(request.url).protocol === "https:" ? "; Secure" : ""));
    return new Response(response.body, { status: response.status, headers });
  }
  const room = activeRoom(request);
  if (!room) return unauthorized();
  if (body?.kind === "action") return forward(room.stub, "/action", room.token, body.action);
  if (body?.kind === "step") return forward(room.stub, "/step", room.token, {});
  return unauthorized();
}

export async function DELETE(request: Request) {
  const room = activeRoom(request);
  if (!room) return unauthorized();
  const response = await forward(room.stub, "/leave", room.token, {});
  const headers = new Headers(response.headers);
  headers.set("Set-Cookie", "werewolf_room=; Path=/api/werewolf; HttpOnly; SameSite=Strict; Max-Age=0");
  return new Response(response.body, { status: response.status, headers });
}
