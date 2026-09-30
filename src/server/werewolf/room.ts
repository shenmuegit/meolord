/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { act, newRoom, publicView, step, waitingForHuman, type HumanAction, type Room } from "./engine";
import { speechPatch } from "./speech-patch";

const denied = () => Response.json({ error: "Unauthorized" }, { status: 401 });
const json = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "no-store" } });

export class WerewolfRoom extends DurableObject {
  private inFlight = false;
  private closed = false;
  private pendingModel: AbortController | null = null;

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
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
        const body = await request.json().catch(() => null) as { name?: unknown; token?: unknown } | null;
        if (typeof body?.name !== "string" || typeof body.token !== "string" || body.token.length < 32) return denied();
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start: (controller) => {
            const send = (value: unknown) => controller.enqueue(encoder.encode("data: " + JSON.stringify(value) + "\n\n"));
            void (async () => {
              try {
                const room = await newRoom(body.name as string, body.token as string, send);
                await this.ctx.storage.put("room", room);
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
                send({ type: "state", ...publicView(room) });
              }
            } catch (error) {
              if (!this.closed) {
                room.state = { ...room.state, phase: "GAME_END", winner: null };
                await this.ctx.storage.put("room", room);
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
