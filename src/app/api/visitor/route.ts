import { getCloudflareContext } from "@opennextjs/cloudflare";
import { visitorIdentity, type VisitorEvent } from "@/server/visitor-log";

type RoomNamespace = { getByName(name: string): { fetch(request: Request): Promise<Response> } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const env = getCloudflareContext().env as unknown as { WEREWOLF_ROOMS: RoomNamespace; VISITOR_LOG_TOKEN?: string };
  if (!env.VISITOR_LOG_TOKEN || request.headers.get("authorization") !== `Bearer ${env.VISITOR_LOG_TOKEN}`) {
    return new Response(null, { status: 404 });
  }
  const url = new URL(request.url);
  const table = url.searchParams.get("table") ?? "visits";
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!["visits", "events", "games", "messages"].includes(table) || !Number.isSafeInteger(offset) || offset < 0) {
    return new Response(null, { status: 400 });
  }
  const result = await env.WEREWOLF_ROOMS.getByName("visitor-log").fetch(new Request(`https://room/visitor-export?table=${table}&offset=${offset}`));
  return new Response(result.body, { status: result.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const raw = await request.text();
  if (raw.length > 4096) return new Response(null, { status: 413 });
  let body: Record<string, unknown> | null;
  try {
    body = JSON.parse(raw || "null") as Record<string, unknown> | null;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!body || !uuid.test(String(body.id ?? "")) || !["pageview", "click"].includes(String(body.kind)) ||
    typeof body.path !== "string" || !body.path.startsWith("/") || body.path.length > 300 ||
    (body.label != null && (typeof body.label !== "string" || body.label.length > 200)) ||
    (body.href != null && (typeof body.href !== "string" || body.href.length > 500))) {
    return new Response(null, { status: 400 });
  }
  const device = body.device == null ? null : JSON.stringify(body.device);
  if (device && device.length > 1000) return new Response(null, { status: 400 });
  const { identity, setCookies } = visitorIdentity(request);
  const event: VisitorEvent = {
    identity,
    id: String(body.id),
    kind: body.kind as VisitorEvent["kind"],
    path: body.path,
    label: body.label as string | null ?? null,
    href: body.href as string | null ?? null,
    device,
  };
  const rooms = (getCloudflareContext().env as unknown as { WEREWOLF_ROOMS: RoomNamespace }).WEREWOLF_ROOMS;
  const saved = await rooms.getByName("visitor-log").fetch(new Request("https://room/visitor-event", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event),
  }));
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: saved.ok ? 204 : 503, headers });
}
