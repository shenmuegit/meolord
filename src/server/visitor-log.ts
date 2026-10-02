import type { SqlStorage } from "@cloudflare/workers-types";
import type { ChatMessage } from "@/vendor/wolfcha/types/game";

export type VisitorIdentity = {
  visitorId: string;
  visitId: string;
  ip: string | null;
  userAgent: string | null;
  country: string | null;
};

export type VisitorEvent = {
  identity: VisitorIdentity;
  id: string;
  kind: "pageview" | "click";
  path: string;
  label: string | null;
  href: string | null;
  device: string | null;
};

export type GameSnapshot = {
  identity: VisitorIdentity;
  gameId: string;
  nickname: string;
  startedAt: number;
  status: "started" | "playing" | "finished" | "left" | "error";
  day: number;
  phase: string;
  winner: string | null;
  messages: ChatMessage[];
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function visitorIdentity(request: Request) {
  const cookies = Object.fromEntries((request.headers.get("cookie") ?? "").split(";").map((part) => part.trim().split("=", 2)));
  const visitorId = uuid.test(cookies.visitor_id ?? "") ? cookies.visitor_id : crypto.randomUUID();
  const visitId = uuid.test(cookies.visit_id ?? "") ? cookies.visit_id : crypto.randomUUID();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const setCookies = [
    ...(!uuid.test(cookies.visitor_id ?? "") ? [`visitor_id=${visitorId}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`] : []),
    ...(!uuid.test(cookies.visit_id ?? "") ? [`visit_id=${visitId}; Path=/; SameSite=Lax${secure}`] : []),
  ];
  return {
    identity: {
      visitorId,
      visitId,
      ip: request.headers.get("cf-connecting-ip"),
      userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      country: request.headers.get("cf-ipcountry"),
    } satisfies VisitorIdentity,
    setCookies,
  };
}

export function createVisitorTables(sql: SqlStorage) {
  sql.exec("CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, ip TEXT, user_agent TEXT, country TEXT, device_json TEXT, started_werewolf INTEGER NOT NULL DEFAULT 0)");
  sql.exec("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, visit_id TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, label TEXT, href TEXT, ip TEXT)");
  sql.exec("CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, visit_id TEXT NOT NULL, visitor_id TEXT NOT NULL, nickname TEXT NOT NULL, started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ended_at INTEGER, duration_ms INTEGER, status TEXT NOT NULL, day INTEGER NOT NULL, phase TEXT NOT NULL, winner TEXT, ip TEXT)");
  sql.exec("CREATE TABLE IF NOT EXISTS messages (game_id TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, day INTEGER, phase TEXT, speech_round INTEGER, speaker TEXT NOT NULL, player_id TEXT NOT NULL, is_system INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY (game_id, id))");
  sql.exec("CREATE INDEX IF NOT EXISTS events_by_visit ON events (visit_id, at)");
  sql.exec("CREATE INDEX IF NOT EXISTS games_by_visit ON games (visit_id, started_at)");
  sql.exec("CREATE INDEX IF NOT EXISTS messages_by_game ON messages (game_id, at)");
}

function saveVisit(sql: SqlStorage, identity: VisitorIdentity, at: number, device: string | null) {
  sql.exec(
    "INSERT INTO visits (id, visitor_id, first_seen, last_seen, ip, user_agent, country, device_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen, ip=COALESCE(excluded.ip, visits.ip), user_agent=COALESCE(excluded.user_agent, visits.user_agent), country=COALESCE(excluded.country, visits.country), device_json=COALESCE(excluded.device_json, visits.device_json)",
    identity.visitId, identity.visitorId, at, at, identity.ip, identity.userAgent, identity.country, device,
  );
}

export function saveVisitorEvent(sql: SqlStorage, event: VisitorEvent) {
  const at = Date.now();
  saveVisit(sql, event.identity, at, event.device);
  sql.exec("INSERT OR IGNORE INTO events (id, visit_id, at, kind, path, label, href, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    event.id, event.identity.visitId, at, event.kind, event.path, event.label, event.href, event.identity.ip);
}

export function saveGameSnapshot(sql: SqlStorage, game: GameSnapshot) {
  const now = Date.now();
  const endedAt = ["finished", "left", "error"].includes(game.status) ? now : null;
  saveVisit(sql, game.identity, now, null);
  sql.exec("UPDATE visits SET started_werewolf=1 WHERE id=?", game.identity.visitId);
  sql.exec(
    "INSERT INTO games (id, visit_id, visitor_id, nickname, started_at, updated_at, ended_at, duration_ms, status, day, phase, winner, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, ended_at=COALESCE(games.ended_at, excluded.ended_at), duration_ms=CASE WHEN games.ended_at IS NULL THEN excluded.duration_ms ELSE games.duration_ms END, status=CASE WHEN games.ended_at IS NOT NULL THEN games.status ELSE excluded.status END, day=excluded.day, phase=excluded.phase, winner=excluded.winner",
    game.gameId, game.identity.visitId, game.identity.visitorId, game.nickname, game.startedAt, now, endedAt,
    Math.max(0, now - game.startedAt), game.status, game.day, game.phase, game.winner, game.identity.ip,
  );
  for (const message of game.messages) {
    sql.exec("INSERT OR IGNORE INTO messages (game_id, id, at, day, phase, speech_round, speaker, player_id, is_system, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      game.gameId, message.id, message.timestamp, message.day ?? null, message.phase ?? null,
      message.speechRound ?? null, message.playerName, message.playerId, message.isSystem ? 1 : 0, message.content);
  }
}
