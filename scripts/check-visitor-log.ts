import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SqlStorage } from "@cloudflare/workers-types";
import { createVisitorTables, saveGameSnapshot, saveVisitorEvent, visitorIdentity } from "../src/server/visitor-log";

const db = new DatabaseSync(":memory:");
const sql = {
  exec(query: string, ...bindings: (string | number | null)[]) {
    if (bindings.length) db.prepare(query).run(...bindings);
    else db.exec(query);
  },
} as unknown as SqlStorage;
createVisitorTables(sql);

const request = new Request("https://meolord.com/api/visitor", {
  headers: {
    cookie: "visitor_id=11111111-1111-4111-8111-111111111111; visit_id=22222222-2222-4222-8222-222222222222",
    "cf-connecting-ip": "203.0.113.7",
    "user-agent": "test browser",
  },
});
const { identity, setCookies } = visitorIdentity(request);
assert.equal(setCookies.length, 0);
assert.equal(identity.ip, "203.0.113.7");

const event = {
  identity, id: "33333333-3333-4333-8333-333333333333", kind: "pageview" as const,
  path: "/", label: null, href: null, device: JSON.stringify({ screen: [1280, 800] }),
};
saveVisitorEvent(sql, event);
saveVisitorEvent(sql, event);
saveVisitorEvent(sql, { ...event, id: "44444444-4444-4444-8444-444444444444", kind: "click", label: "开始游戏" });
assert.equal(db.prepare("SELECT count(*) AS count FROM events").get()?.count, 2);
assert.equal(db.prepare("SELECT ip FROM visits").get()?.ip, "203.0.113.7");

const startedAt = Date.now() - 1000;
const firstMessage = { id: "m1", playerId: "human", playerName: "玩家", content: "第一轮", timestamp: startedAt, day: 1, phase: "DAY_SPEECH" as const };
const game = {
  identity, gameId: "55555555-5555-4555-8555-555555555555", nickname: "玩家", startedAt,
  status: "started" as const, day: 1, phase: "DAY_SPEECH", winner: null,
  messages: [firstMessage],
};
saveGameSnapshot(sql, game);
saveGameSnapshot(sql, { ...game, status: "finished", messages: [firstMessage, { ...firstMessage, id: "m2", content: "第二轮", speechRound: 2 }] });
saveGameSnapshot(sql, { ...game, status: "left", messages: [] });
assert.equal(db.prepare("SELECT count(*) AS count FROM messages").get()?.count, 2);
const saved = db.prepare("SELECT nickname, status, duration_ms FROM games").get();
assert.equal(saved?.nickname, "玩家");
assert.equal(saved?.status, "finished");
assert.ok(Number(saved?.duration_ms) >= 1000);
assert.equal(db.prepare("SELECT started_werewolf FROM visits").get()?.started_werewolf, 1);
console.log("visitor log OK");
