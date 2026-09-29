"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createStore, Provider } from "jotai";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { Toaster } from "sonner";
import { ArrowRight, Check, Crown, LoaderCircle, LogOut, MessageCircle, Mic, Moon, RotateCcw, Send, Sun, UserRound, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameLogic } from "@/vendor/wolfcha/hooks/useGameLogic";
import { gameStateAtom, PHASE_CONFIGS } from "@/vendor/wolfcha/store/game-machine";
import { createInitialGameState, formatDailySummaryTranscriptMessage } from "@/vendor/wolfcha/lib/game-master";
import { cn } from "@/lib/utils";
import { isWolfRole } from "@/vendor/wolfcha/types/game";
import type { Phase, Player, Role } from "@/vendor/wolfcha/types/game";
import messages from "@/vendor/wolfcha/i18n/messages/zh.json";

const roleKeys: Record<Role, string> = {
  Villager: "villager",
  Werewolf: "werewolf",
  WhiteWolfKing: "whiteWolfKing",
  Seer: "seer",
  Witch: "witch",
  Hunter: "hunter",
  Guard: "guard",
  Idiot: "idiot",
};

const speechPhases: Phase[] = ["DAY_SPEECH", "DAY_LAST_WORDS", "DAY_BADGE_SPEECH", "DAY_PK_SPEECH"];

function Table() {
  const t = useTranslations();
  const {
    humanName, setHumanName, gameStarted, gameState, isLoading, isWaitingForAI,
    waitingForNextRound, currentDialogue, inputText, setInputText, humanPlayer,
    startGame, continueAfterRoleReveal, restartGame, handleHumanSpeech,
    handleFinishSpeaking, handleBadgeSignup, handleHumanVote, handleNightAction,
    handleHumanBadgeTransfer, handleWhiteWolfKingBoom, handleNextRound,
    advanceSpeech, markCurrentSegmentCompleted,
  } = useGameLogic();
  const [revealedGameId, setRevealedGameId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ phase: Phase; seat: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const phase = gameState.phase;
  const selectedSeat = selection?.phase === phase ? selection.seat : null;
  const phaseConfig = PHASE_CONFIGS[phase];
  const needsInput = !!humanPlayer && phaseConfig.requiresHumanInput(humanPlayer, gameState);
  const showReveal = gameStarted && !isLoading && !!humanPlayer && phase === "NIGHT_START" && gameState.day === 1 && revealedGameId !== gameState.gameId;
  const myTurn = needsInput && speechPhases.includes(phase);
  const canSelect = needsInput && (phase !== "NIGHT_WITCH_ACTION" || !gameState.roleAbilities.witchPoisonUsed);
  const candidates = canSelect && humanPlayer
    ? gameState.players.filter((player) => phaseConfig.canSelectPlayer(humanPlayer, player, gameState))
    : [];
  const selectedPlayer = candidates.find((player) => player.seat === selectedSeat);
  const phaseText = phaseConfig.humanDescription?.(humanPlayer, gameState) ?? t(phaseConfig.description);
  const roleName = humanPlayer ? t(`roles.${roleKeys[humanPlayer.role]}`) : "";
  const aiPlayers = gameState.players.filter((player) => !player.isHuman);
  const preparedCount = aiPlayers.filter((player) => player.agentProfile).length;
  const canSpeak = myTurn && !busy && !isLoading && !showReveal;
  const seats: Player[] = gameStarted ? gameState.players : Array.from({ length: 8 }, (_, seat) => ({
    playerId: String(seat), seat, displayName: seat === 0 ? humanName || "你" : "",
    isHuman: seat === 0, alive: true, role: "Villager", alignment: "village",
  }));
  const visibleMessages = useMemo(() => gameState.messages.filter((message) =>
    !message.content.startsWith("[ROLE_REVEAL]") &&
    (!message.phase?.startsWith("NIGHT_") || message.phase === "NIGHT_START"),
  ), [gameState.messages]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleMessages.length, currentDialogue?.text]);

  const run = useCallback(async (action: () => Promise<unknown> | unknown) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试。");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const next = useCallback(async () => {
    if (currentDialogue) {
      if (currentDialogue.isStreaming) markCurrentSegmentCompleted();
      const result = await advanceSpeech();
      if (result.shouldAdvanceToNextSpeaker) await handleNextRound();
    } else if (waitingForNextRound) {
      await handleNextRound();
    }
  }, [advanceSpeech, currentDialogue, handleNextRound, markCurrentSegmentCompleted, waitingForNextRound]);

  useEffect(() => {
    if (!gameStarted || isLoading || showReveal || needsInput || isWaitingForAI || phase === "GAME_END") return;
    if (!currentDialogue?.isStreaming && !waitingForNextRound) return;
    const delay = currentDialogue ? Math.min(9000, Math.max(3000, currentDialogue.text.length * 65)) : 1200;
    const timer = window.setInterval(() => { void run(next); }, delay);
    return () => window.clearInterval(timer);
  }, [currentDialogue, gameStarted, isLoading, isWaitingForAI, needsInput, next, phase, run, showReveal, waitingForNextRound]);

  const confirmTarget = () => {
    if (!selectedPlayer) return;
    const seat = selectedPlayer.seat;
    setSelection(null);
    void run(async () => {
      if (phase === "DAY_VOTE" || phase === "DAY_BADGE_ELECTION") await handleHumanVote(seat);
      else if (phase === "BADGE_TRANSFER") await handleHumanBadgeTransfer(seat);
      else await handleNightAction(seat);
    });
  };

  const restart = () => {
    restartGame();
    setRevealedGameId(null);
    setSelection(null);
    setError("");
  };

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-7">
        <div>
          <h2 id="wolfcha-title" className="text-xl font-semibold tracking-tight">
            {!gameStarted ? "来一局狼人杀？" : isLoading ? "玩家正在入座" : phase === "GAME_END" ? "本局结束" : "第 " + gameState.day + " 天 · " + (phase.startsWith("NIGHT_") ? "夜晚" : "白天")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{!gameStarted ? "围坐一桌，在每一次发言里寻找真相。" : phaseText}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="size-3.5" aria-hidden="true" />{gameStarted ? "剩余 " + gameState.players.filter((player) => player.alive).length + " 人" : "你 + 7 位 AI"}</span>
          {gameStarted && <Button type="button" variant="ghost" size="sm" onClick={restart} className="gap-1.5 text-muted-foreground"><LogOut className="size-3.5" aria-hidden="true" />退出本局</Button>}
        </div>
      </header>

      <div className="grid min-w-0 lg:grid-cols-[3fr_2fr]">
        <div className="min-w-0 px-2 py-5 sm:px-5 sm:py-7">
          <div className="relative mx-auto aspect-square w-full max-w-[460px]" role="group" aria-label="八人圆桌">
            <div aria-hidden="true" className="absolute inset-[23%] rounded-full border border-border bg-muted/45 shadow-[inset_0_2px_16px_0_rgb(0_0_0/0.025)]">
              <div className="absolute inset-2 rounded-full border border-border/60" />
            </div>
            <div className="absolute inset-[27%] flex flex-col items-center justify-center gap-2 text-center">
              {isLoading ? (
                <div className="w-full space-y-2" role="status">
                  <LoaderCircle className="mx-auto size-6 animate-spin text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium">准备中 · {preparedCount}/{aiPlayers.length}</p>
                  <progress aria-label="AI 玩家准备进度" value={preparedCount} max={aiPlayers.length || 7} className="mx-auto block h-1 w-4/5 accent-foreground" />
                </div>
              ) : showReveal ? (
                <>
                  <p className="text-[10px] text-muted-foreground sm:text-xs">你的身份</p>
                  <p className="text-xl font-semibold sm:text-2xl">{roleName}</p>
                  <Button type="button" size="sm" className="mt-1 px-2.5 text-xs" disabled={busy} onClick={() => void run(async () => { setRevealedGameId(gameState.gameId); await continueAfterRoleReveal(); })}>进入第一夜<ArrowRight className="ml-1 size-3" aria-hidden="true" /></Button>
                </>
              ) : (
                <>
                  {phase.startsWith("NIGHT_") ? <Moon className="size-6 text-muted-foreground sm:size-7" aria-hidden="true" /> : gameStarted ? <Sun className="size-6 text-muted-foreground sm:size-7" aria-hidden="true" /> : <Moon className="size-6 text-muted-foreground sm:size-7" aria-hidden="true" />}
                  <p className="text-base font-medium tracking-tight sm:text-lg">{!gameStarted ? "天黑，请闭眼" : phase === "GAME_END" ? (gameState.winner === "village" ? "好人获胜" : "狼人获胜") : needsInput ? "轮到你了" : isWaitingForAI ? "正在思考" : "听听大家怎么说"}</p>
                  <p className="text-[10px] leading-4 text-muted-foreground sm:text-xs">{!gameStarted ? "八人圆桌 · 等你入座" : phase === "GAME_END" ? "所有身份已揭晓" : candidates.length > 0 ? "点击座位选择目标" : myTurn ? "在下方说出你的判断" : needsInput ? "请在下方完成行动" : "第 " + gameState.day + " 天"}</p>
                </>
              )}
            </div>
            {seats.map((player) => {
              const angle = ((player.seat - (humanPlayer?.seat ?? 0)) / 8) * Math.PI * 2 + Math.PI / 2;
              const selectable = !isLoading && !showReveal && !busy && candidates.some((candidate) => candidate.seat === player.seat);
              const selected = selectedSeat === player.seat;
              const speaking = gameStarted && !isLoading && !showReveal && (currentDialogue?.speaker === player.displayName || (myTurn && player.isHuman));
              const label = player.displayName || (gameStarted ? "就座中" : "等待入座");
              const status = !gameStarted ? (player.isHuman ? "你的座位" : "") : isLoading ? (player.isHuman ? "你" : player.agentProfile ? "已就座" : "准备中") : phase === "GAME_END" ? t("roles." + roleKeys[player.role]) : !player.alive ? "" : speaking ? "发言中" : player.isHuman ? "你 · " + roleName : humanPlayer && isWolfRole(humanPlayer.role) && isWolfRole(player.role) ? "狼队" : "";
              return (
                <button
                  key={player.playerId}
                  type="button"
                  aria-label={(player.seat + 1) + " 号 " + label + (status ? " · " + status : "") + (player.alive ? "" : " · 已出局")}
                  aria-pressed={selected}
                  disabled={!selectable}
                  title={label}
                  onClick={() => setSelection({ phase, seat: player.seat })}
                  style={{ left: (50 + Math.cos(angle) * 35) + "%", top: (50 + Math.sin(angle) * 35) + "%" }}
                  className={cn("absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-lg text-center outline-offset-4 transition-opacity focus-visible:outline-2 focus-visible:outline-ring sm:w-20 sm:py-1", selectable && "cursor-pointer")}
                >
                  <span className={cn("relative mb-1 flex size-8 items-center justify-center rounded-full border border-border bg-background text-sm font-medium transition-all sm:mb-2 sm:size-12 sm:text-base", speaking && "ring-2 ring-foreground ring-offset-4 ring-offset-background", selected && "border-foreground bg-foreground text-background ring-2 ring-foreground/25 ring-offset-2 ring-offset-background", selectable && !selected && "hover:border-foreground hover:ring-2 hover:ring-border", !gameStarted && !player.isHuman && "border-dashed text-muted-foreground") }>
                    {player.isHuman ? <UserRound className="size-5" aria-hidden="true" /> : player.displayName ? player.displayName.slice(0, 1) : <UserRound className="size-4 opacity-45" aria-hidden="true" />}
                    {!player.alive && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/80 text-foreground" aria-hidden="true"><X className="size-6 sm:size-9" /></span>}
                    <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-border bg-background text-[9px] font-medium text-foreground sm:size-[18px]">{player.seat + 1}</span>
                    {gameState.badge.holderSeat === player.seat && gameStarted && <Crown className="absolute -top-3 left-1/2 size-3.5 -translate-x-1/2 text-foreground" aria-label="警长" />}
                    {selected && <span className="absolute -right-1 -top-1 rounded-full bg-foreground p-0.5 text-background"><Check className="size-2.5" /></span>}
                  </span>
                  <span className="w-full truncate text-[11px] font-medium leading-4 sm:text-xs">{label}</span>
                  <span className={cn("mt-0.5 flex min-h-3 items-center gap-1 text-[9px] leading-3 text-muted-foreground sm:min-h-4 sm:text-[10px] sm:leading-4", speaking && "font-medium text-foreground")}>{status && speaking && <Mic className="size-2.5" aria-hidden="true" />}{status}</span>
                </button>
              );
            })}
          </div>
          {humanPlayer?.role === "Seer" && !!gameState.nightActions.seerHistory?.length && <div className="mx-auto mt-1 max-w-md rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground"><p className="font-medium text-foreground">我的查验记录</p>{gameState.nightActions.seerHistory.map((result) => <span key={result.day + ":" + result.targetSeat} className="mr-3 inline-block">第 {result.day} 夜 · {result.targetSeat + 1} 号 · {result.isWolf ? "狼人" : "好人"}</span>)}</div>}
        </div>

        <aside className="flex h-[360px] min-h-0 min-w-0 flex-col overflow-hidden border-t border-border bg-muted/15 lg:h-[516px] lg:border-l lg:border-t-0" aria-label="聊天区">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4 text-xs font-medium"><MessageCircle className="size-3.5" aria-hidden="true" />对局记录</div>
          {!gameStarted ? (
            <div className="flex flex-1 flex-col justify-center px-6 py-6 sm:px-8">
              <p className="text-lg font-medium tracking-tight">你的座位，已经留好。</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">给自己起个名字，和 7 位 AI 一起入局。</p>
              <form className="mt-6 space-y-3" onSubmit={(event) => { event.preventDefault(); void run(() => startGame({ playerCount: 8, difficulty: "normal" })); }}>
                <label htmlFor="wolfcha-name" className="block text-xs text-muted-foreground">你的名字</label>
                <input id="wolfcha-name" value={humanName} maxLength={24} onChange={(event) => setHumanName(event.target.value)} placeholder="怎么称呼你？" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-offset-2 focus-visible:outline-ring" />
                <Button type="submit" disabled={busy} className="h-11 w-full gap-2">{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}入座，开始游戏</Button>
              </form>
              <p className="mt-3 text-[11px] text-muted-foreground">离开页面即结束本局。</p>
            </div>
          ) : (
            <div ref={logRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5" aria-label="对局记录" role="log" aria-live="polite">
              {visibleMessages.length === 0 && <p className="py-8 text-center text-xs leading-6 text-muted-foreground">{isLoading ? "大家正在准备，稍候就能开局。" : "对局开始后，发言会记录在这里。"}</p>}
              {visibleMessages.map((message) => {
                const player = gameState.players.find((candidate) => candidate.playerId === message.playerId);
                if (message.isSystem) return <p key={message.id} className="whitespace-pre-line break-words border-l-2 border-border pl-3 text-xs leading-6 text-muted-foreground">{formatDailySummaryTranscriptMessage(message, gameState, "主持人")}</p>;
                return <div key={message.id} className="flex gap-2.5">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px]">{player ? player.seat + 1 : "·"}</span>
                  <div className="min-w-0"><p className="mb-1 text-xs font-medium">{player?.displayName || message.playerName}{player?.isHuman && player.displayName !== "你" && <span className="ml-1.5 font-normal text-muted-foreground">你</span>}</p><p className="whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">{message.content}</p></div>
                </div>;
              })}
              {currentDialogue && visibleMessages.at(-1)?.content !== currentDialogue.text && <div className="rounded-xl border border-border bg-background p-3 text-sm leading-6"><p className="mb-1 flex items-center gap-1.5 text-xs font-medium"><Mic className="size-3" aria-hidden="true" />{currentDialogue.speaker}</p><p className="whitespace-pre-line break-words">{currentDialogue.text}</p></div>}
              {isWaitingForAI && <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" aria-hidden="true" />AI 正在思考…</p>}
            </div>
          )}
        </aside>
      </div>

      <div className="border-t border-border bg-muted/10 px-5 py-4 sm:px-7">
        {needsInput && !showReveal && !isLoading && <div className="mb-3 space-y-3">
          {phase === "DAY_BADGE_SIGNUP" && <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={busy} onClick={() => void run(() => handleBadgeSignup(true))}>报名竞选</Button><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => handleBadgeSignup(false))}>不报名</Button></div>}
          {phase === "NIGHT_WITCH_ACTION" && <div className="space-y-3">{gameState.nightActions.wolfTarget !== undefined && <p className="text-xs text-muted-foreground">今晚被袭击：{gameState.nightActions.wolfTarget + 1} 号位 · {gameState.players.find((player) => player.seat === gameState.nightActions.wolfTarget)?.displayName}</p>}<div className="flex flex-wrap gap-2">{!gameState.roleAbilities.witchHealUsed && gameState.nightActions.wolfTarget !== undefined && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => handleNightAction(gameState.nightActions.wolfTarget!, "save"))}>使用解药</Button>}{!gameState.roleAbilities.witchPoisonUsed && <Button type="button" variant="outline" size="sm" disabled={busy || !selectedPlayer} onClick={() => { const seat = selectedPlayer!.seat; setSelection(null); void run(() => handleNightAction(seat, "poison")); }}>毒杀所选玩家</Button>}<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => handleNightAction(-1, "pass"))}>不用药</Button></div></div>}
          {candidates.length > 0 && <p className="text-xs text-muted-foreground">{selectedPlayer ? "已选择 " + (selectedPlayer.seat + 1) + " 号 · " + selectedPlayer.displayName : "点击圆桌上的玩家，选择行动目标。"}</p>}
          {selectedPlayer && phase !== "NIGHT_WITCH_ACTION" && <Button type="button" size="sm" disabled={busy} onClick={confirmTarget}>{phase === "DAY_VOTE" || phase === "DAY_BADGE_ELECTION" ? "确认投票" : "确认目标"}</Button>}
          {phase === "BADGE_TRANSFER" && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => handleHumanBadgeTransfer(-1))}>撕毁警徽</Button>}
          {phase === "HUNTER_SHOOT" && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => handleNightAction(-1))}>不开枪</Button>}
          {phase === "WHITE_WOLF_KING_BOOM" && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => handleNightAction(-1))}>不带走其他人</Button>}
          {phase === "NIGHT_SEER_ACTION" && gameState.nightActions.seerTarget !== undefined && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(next)}>看完结果，继续</Button>}
        </div>}
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full bg-muted-foreground/40", canSpeak && "bg-foreground")} />{!gameStarted ? "等待入座" : isLoading ? "准备牌桌中" : showReveal ? "请先确认你的身份" : phase === "GAME_END" ? "对局已结束" : myTurn ? "轮到你发言" : needsInput ? "轮到你行动" : humanPlayer && !humanPlayer.alive ? "你已出局" : "等待其他玩家行动"}</span>
          {myTurn && <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={busy} onClick={() => void run(handleFinishSpeaking)}>结束发言<ArrowRight className="ml-1 size-3" /></Button>}
          {!needsInput && !isLoading && !showReveal && gameStarted && phase !== "GAME_END" && (currentDialogue || waitingForNextRound) && <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={busy || isWaitingForAI} onClick={() => void run(next)}>继续<ArrowRight className="ml-1 size-3" /></Button>}
        </div>
        <form className="flex items-center gap-2 rounded-xl border border-input bg-background p-1.5 pl-3.5 focus-within:ring-1 focus-within:ring-ring" onSubmit={(event) => { event.preventDefault(); if (canSpeak && inputText.trim()) void run(handleHumanSpeech); }}>
          <input aria-label="你的发言" value={inputText} disabled={!canSpeak} onChange={(event) => setInputText(event.target.value)} placeholder={canSpeak ? "说出你的判断…" : "轮到你时，在这里发言…"} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/65 disabled:cursor-not-allowed" />
          <Button type="submit" size="sm" className="h-9 gap-1.5 rounded-lg px-3" disabled={!canSpeak || !inputText.trim()}><Send className="size-3.5" aria-hidden="true" /><span className="hidden sm:inline">发送</span><span className="sr-only sm:hidden">发送发言</span></Button>
        </form>
        {humanPlayer?.role === "WhiteWolfKing" && humanPlayer.alive && !gameState.roleAbilities.whiteWolfKingBoomUsed && speechPhases.includes(phase) && <Button type="button" variant="outline" size="sm" className="mt-3" disabled={busy} onClick={() => void run(handleWhiteWolfKingBoom)}>白狼王自爆</Button>}
        {phase === "GAME_END" && <Button type="button" className="mt-4" onClick={restart}>再来一局<RotateCcw className="ml-2 size-4" aria-hidden="true" /></Button>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
      <Toaster position="bottom-center" />
    </>
  );
}

export default function WolfchaGame() {
  const [store] = useState(() => {
    const nextStore = createStore();
    nextStore.set(gameStateAtom, createInitialGameState());
    return nextStore;
  });
  return <Provider store={store}><NextIntlClientProvider locale="zh" messages={messages}><Table /></NextIntlClientProvider></Provider>;
}
