"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorageState } from "ahooks";
import type { GameState, Player } from "@/vendor/wolfcha/types/game";
import { createInitialGameState } from "@/vendor/wolfcha/lib/game-master";

type View = { state: GameState; canAct: boolean };
type Dialogue = { speaker: string; segments: string[]; streamKey: string; isStreaming: boolean; isPartial: boolean };
type Preparation = { humanSeat: number; names: Record<number, string> };

export function useServerGame() {
  const [humanName, setHumanName] = useLocalStorageState<string>("werewolf_human_name", { defaultValue: "" });
  const [gameState, setGameState] = useState<GameState>(createInitialGameState);
  const [gameStarted, setGameStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preparation, setPreparation] = useState<Preparation>({ humanSeat: 0, names: {} });
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const [inputText, setInputText] = useState("");
  const [currentDialogue, setCurrentDialogue] = useState<Dialogue | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const stepAbort = useRef<AbortController | null>(null);
  const leaving = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    const leave = () => {
      if (!active.current) return;
      active.current = false;
      generation.current += 1;
      stepAbort.current?.abort();
      leaving.current = fetch("/api/werewolf/game", { method: "DELETE", keepalive: true }).catch(() => null);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, []);

  const applyView = useCallback((view: View) => {
    setGameState(view.state);
    setGameStarted(true);
  }, []);

  const post = useCallback(async (body: unknown, signal?: AbortSignal): Promise<Response> => {
    const response = await fetch("/api/werewolf/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      if (response.status === 401) {
        if ((body as { kind?: unknown })?.kind === "start") throw new Error("暂时无法开局，请稍后再试。");
        active.current = false;
        setGameStarted(false);
        setCurrentDialogue(null);
        throw new Error("本局已结束，请重新入座。");
      }
      throw new Error("对局请求失败，请重试。");
    }
    return response;
  }, []);

  const drive = useCallback(async (initial: View) => {
    let view = initial;
    let count = 0;
    const run = generation.current;
    try {
      while (active.current && generation.current === run && !view.canAct && view.state.phase !== "GAME_END") {
        if (++count > 120) throw new Error("对局推进次数过多");
        setIsWaitingForAI(true);
        const controller = new AbortController();
        stepAbort.current = controller;
        try {
          const response = await post({ kind: "step" }, controller.signal);
          const reader = response.body?.getReader();
          if (!reader) throw new Error("对局没有返回数据");
          const decoder = new TextDecoder();
          let buffer = "";
          let speechLength = 0;
          const speechSegments: string[] = [];
          let pendingView: View | null = null;
          const streamKey = crypto.randomUUID();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (generation.current !== run) return;
              buffer += decoder.decode(value, { stream: true });
              const frames = buffer.split("\n\n");
              buffer = frames.pop() ?? "";
              for (const frame of frames) {
                const data = frame.split("\n").find((line) => line.startsWith("data: "));
                if (!data) continue;
                const event = JSON.parse(data.slice(6)) as
                  | ({ type: "state" } & View)
                  | { type: "speech"; speaker: string; index: number; from: number; delta: string }
                  | { type: "error"; message: string };
                if (event.type === "error") {
                  if (pendingView) applyView(pendingView);
                  throw new Error(event.message);
                }
                if (event.type === "state") {
                  view = event;
                  if (speechLength) pendingView = event;
                  else applyView(event);
                } else {
                  speechSegments[event.index] = (speechSegments[event.index] ?? "").slice(0, event.from) + event.delta;
                  speechLength = speechSegments.reduce((length, segment) => length + segment.length, 0);
                  setCurrentDialogue({ speaker: event.speaker, segments: speechSegments.slice(), streamKey, isStreaming: true, isPartial: true });
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
          if (speechLength) {
            await new Promise<void>((resolve) => {
              const timer = window.setTimeout(resolve, speechLength * 52 + 250);
              controller.signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve(); }, { once: true });
            });
            if (generation.current !== run) return;
            setCurrentDialogue(null);
          }
          if (pendingView) applyView(pendingView);
        } catch (error) {
          if (generation.current !== run) return;
          throw error;
        } finally {
          if (stepAbort.current === controller) stepAbort.current = null;
        }
      }
    } finally {
      if (generation.current === run) setIsWaitingForAI(false);
    }
  }, [applyView, post]);

  const action = useCallback(async (value: unknown) => {
    const run = generation.current;
    try {
      const response = await post({ kind: "action", action: value });
      const view = await response.json() as View;
      if (generation.current !== run || !active.current) return;
      applyView(view);
      await drive(view);
    } catch (error) {
      if (generation.current !== run) return;
      throw error;
    }
  }, [applyView, drive, post]);

  const startGame = useCallback(async () => {
    setIsLoading(true);
    setPreparation({ humanSeat: 0, names: {} });
    try {
      if (leaving.current) await leaving.current;
      leaving.current = null;
      const response = await post({ kind: "start", name: humanName?.trim() });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("开局没有返回数据");
      const decoder = new TextDecoder();
      let buffer = "";
      let view: View | null = null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const data = frame.split("\n").find((line) => line.startsWith("data: "));
            if (!data) continue;
            const event = JSON.parse(data.slice(6)) as
              | { type: "seating"; humanSeat: number }
              | { type: "character"; seat: number; name: string }
              | { type: "reset" }
              | ({ type: "ready" } & View)
              | { type: "error"; message: string };
            if (event.type === "error") throw new Error(event.message);
            if (event.type === "seating" && Number.isInteger(event.humanSeat) && event.humanSeat >= 0 && event.humanSeat < 8) {
              setPreparation({ humanSeat: event.humanSeat, names: {} });
            } else if (event.type === "character" && Number.isInteger(event.seat) && event.seat >= 0 && event.seat < 8 && typeof event.name === "string") {
              setPreparation((current) => ({ ...current, names: { ...current.names, [event.seat]: event.name } }));
            } else if (event.type === "reset") {
              setPreparation((current) => ({ ...current, names: {} }));
            } else if (event.type === "ready") view = event;
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (!view) throw new Error("开局没有完成，请重试。");
      active.current = true;
      applyView(view);
    } catch (error) {
      setPreparation({ humanSeat: 0, names: {} });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [applyView, humanName, post]);

  const restartGame = useCallback(() => {
    active.current = false;
    generation.current += 1;
    stepAbort.current?.abort();
    leaving.current = fetch("/api/werewolf/game", { method: "DELETE", keepalive: true }).catch(() => null);
    setGameState(createInitialGameState());
    setGameStarted(false);
    setPreparation({ humanSeat: 0, names: {} });
    setInputText("");
    setCurrentDialogue(null);
    setIsWaitingForAI(false);
  }, []);

  const humanPlayer: Player | null = gameState.players.find((p) => p.isHuman) ?? null;

  return {
    humanName: humanName ?? "", setHumanName,
    gameStarted, gameState, isLoading, isWaitingForAI, preparation,
    waitingForNextRound: false,
    currentDialogue, inputText, setInputText, humanPlayer,
    startGame,
    continueAfterRoleReveal: () => action({ type: "reveal" }),
    restartGame,
    handleHumanSpeech: async () => { const text = inputText.trim(); if (text) { setInputText(""); await action({ type: "speech", text }); } },
    handleFinishSpeaking: () => action({ type: "speech", text: "" }),
    handleHumanVote: (seat: number) => action({ type: "vote", seat }),
    handleNightAction: (seat: number, choice?: "save" | "poison" | "pass") => action(gameState.phase === "HUNTER_SHOOT" ? { type: "hunter", seat } : { type: "night", seat, choice }),
    handleBadgeSignup: (signup: boolean) => action({ type: "badge-signup", signup }),
    handleBadgeTransfer: (seat: number) => action({ type: "badge-transfer", seat }),
  };
}
