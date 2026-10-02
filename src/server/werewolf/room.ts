/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { act, newRoom, publicView, step, waitingForHuman, type HumanAction, type Room } from "./engine";
import { speechPatch } from "./speech-patch";
import { createVisitorTables, saveGameSnapshot, saveVisitorEvent, type GameSnapshot, type VisitorEvent, type VisitorIdentity } from "@/server/visitor-log";

const denied = () => Response.json({ error: "Unauthorized" }, { status: 401 });
const json = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "no-store" } });

export class WerewolfRoom extends DurableObject {
  private inFlight = false;
  private closed = false;
  private pendingModel: AbortController | null = null;
  private analyticsReady = false;

  private async recordSnapshot(room: Room, status: GameSnapshot["status"]) {
    const identity = await this.ctx.storage.get<VisitorIdentity>("visitor_identity");
    if (!identity) return;
    const logged = await this.ctx.storage.get<number>("logged_messages") ?? 0;
    const snapshot: GameSnapshot = {
      identity,
      gameId: room.state.gameSessionId || room.state.gameId,
      nickname: room.state.players.find((player) => player.isHuman)?.displayName ?? "",
      startedAt: room.state.startTime ?? Date.now(),
      status,
      day: room.state.day,
      phase: room.state.phase,
      winner: room.state.winner ?? null,
      messages: room.state.messages.slice(logged),
    };
    try {
      const namespace = (this.env as { WEREWOLF_ROOMS: { getByName(name: string): { fetch(request: Request): Promise<Response> } } }).WEREWOLF_ROOMS;
      const saved = await namespace.getByName("visitor-log").fetch(new Request("https://room/game-snapshot", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot),
      }));
      if (!saved.ok) throw new Error(`visitor log returned ${saved.status}`);
      await this.ctx.storage.put("logged_messages", room.state.messages.length);
    } catch (error) {
      console.error("Werewolf visitor log failed", error);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/visitor-event" || path === "/game-snapshot" || path === "/visitor-export") {
      if (!this.analyticsReady) {
        createVisitorTables(this.ctx.storage.sql);
        this.analyticsReady = true;
      }
      if (path === "/visitor-export") {
        const table = url.searchParams.get("table") ?? "visits";
        const offset = Number(url.searchParams.get("offset") ?? 0);
        if (!["visits", "events", "games", "messages"].includes(table) || !Number.isSafeInteger(offset) || offset < 0) return denied();
        return json(this.ctx.storage.sql.exec(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT 100 OFFSET ?`, offset).toArray());
      }
      if (path === "/visitor-event") saveVisitorEvent(this.ctx.storage.sql, await request.json() as VisitorEvent);
      else saveGameSnapshot(this.ctx.storage.sql, await request.json() as GameSnapshot);
      return new Response(null, { status: 204 });
    }
    if (path === "/allow-start") {
      if (this.inFlight) return denied();
      this.inFlight = true;
      try {
        const now = Date.now();
        const starts = (await this.ctx.storage.get<number[]>("starts") ?? []).filter((at) => now - at < 3_600_000);
        if (starts.length >= 6) return denied();
        starts.push(now);
        await this.ctx.storage.put("starts", starts);
        return json({ allowed: true });
      } finally {
        this.inFlight = false;
      }
    }
    if (path === "/start") {
      if (this.inFlight) return denied();
      this.inFlight = true;
      let streaming = false;
      try {
        if (await this.ctx.storage.get<Room>("room")) return denied();
        const body = await request.json().catch(() => null) as { name?: unknown; token?: unknown; identity?: VisitorIdentity } | null;
        if (typeof body?.name !== "string" || typeof body.token !== "string" || body.token.length < 32) return denied();
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start: (controller) => {
            const send = (value: unknown) => controller.enqueue(encoder.encode("data: " + JSON.stringify(value) + "\n\n"));
            void (async () => {
              try {
                const room = await newRoom(body.name as string, body.token as string, send);
                await this.ctx.storage.put("room", room);
                if (body.identity) await this.ctx.storage.put("visitor_identity", body.identity);
                await this.recordSnapshot(room, "started");
                send({ type: "ready", ...publicView(room) });
              } catch (error) {
                console.error("Werewolf start failed", error);
                send({ type: "error", message: "玩家入座失败，请重试。" });
              } finally {
                this.inFlight = false;
                controller.close();
              }
            })();
          },
        });
        streaming = true;
        return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
      } finally {
        if (!streaming) this.inFlight = false;
      }
    }
    const room = await this.ctx.storage.get<Room>("room");
    if (!room || room.token !== request.headers.get("X-Game-Token") || this.closed || Date.now() - room.updatedAt > 3_600_000) return denied();
    if (path === "/state") return json(publicView(room));
    if (path === "/leave") {
      this.closed = true;
      this.pendingModel?.abort();
      await this.recordSnapshot(room, room.state.phase === "GAME_END" ? "finished" : "left");
      await this.ctx.storage.delete("room");
      return json({ ended: true });
    }
    if (this.inFlight) return denied();
    this.inFlight = true;
    if (path === "/action") {
      try {
        if (await this.ctx.storage.get<boolean>("processing")) return denied();
        const action = await request.json().catch(() => null) as HumanAction | null;
        if (!action || !act(room, action)) return denied();
        await this.ctx.storage.put("room", room);
        await this.recordSnapshot(room, room.state.phase === "GAME_END" ? "finished" : "playing");
        return json(publicView(room));
      } finally {
        this.inFlight = false;
      }
    }
    if (path === "/step") {
      if (await this.ctx.storage.get<boolean>("processing") || waitingForHuman(room) || room.state.phase === "GAME_END") {
        this.inFlight = false;
        return denied();
      }
      await this.ctx.storage.put("processing", true);
      const modelAbort = new AbortController();
      this.pendingModel = modelAbort;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          const send = (value: unknown) => controller.enqueue(encoder.encode("data: " + JSON.stringify(value) + "\n\n"));
          void (async () => {
            try {
              send({ type: "state", ...publicView(room) });
              const previousSegments = new Map<number, string>();
              const changed = await step(room, (speaker, index, text) => {
                const patch = speechPatch(previousSegments.get(index) ?? "", text);
                previousSegments.set(index, text);
                if (!this.closed && patch) send({ type: "speech", speaker, index, ...patch });
              }, modelAbort.signal);
              if (!this.closed) {
                if (!changed) throw new Error("无法推进对局");
                await this.ctx.storage.put("room", room);
                await this.recordSnapshot(room, room.state.phase === "GAME_END" ? "finished" : "playing");
                send({ type: "state", ...publicView(room) });
              }
            } catch (error) {
              if (!this.closed) {
                room.state = { ...room.state, phase: "GAME_END", winner: null };
                await this.ctx.storage.put("room", room);
                await this.recordSnapshot(room, "error");
                send({ type: "state", ...publicView(room) });
                console.error("Werewolf step failed", error);
                send({ type: "error", message: "对局暂时无法继续，请重新开局。" });
              }
            } finally {
              if (!this.closed) await this.ctx.storage.delete("processing");
              this.pendingModel = null;
              this.inFlight = false;
              controller.close();
            }
          })();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
    }
    this.inFlight = false;
    return denied();
  }
}
