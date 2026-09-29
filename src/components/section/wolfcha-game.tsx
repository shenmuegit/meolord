"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Provider } from "jotai";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { Toaster } from "sonner";
import { ArrowRight, LoaderCircle, Moon, RotateCcw, Sun, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameLogic } from "@/vendor/wolfcha/hooks/useGameLogic";
import { PHASE_CONFIGS } from "@/vendor/wolfcha/store/game-machine";
import { formatDailySummaryTranscriptMessage } from "@/vendor/wolfcha/lib/game-master";
import { isWolfRole } from "@/vendor/wolfcha/types/game";
import type { Phase, Role } from "@/vendor/wolfcha/types/game";
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
  const visibleMessages = useMemo(() => gameState.messages.filter((message) =>
    !message.content.startsWith("[ROLE_REVEAL]") &&
    (!message.phase?.startsWith("NIGHT_") || message.phase === "NIGHT_START"),
  ), [gameState.messages]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleMessages.length]);

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
      {!gameStarted ? (
        <div className="px-4 py-6 sm:px-6">
          <h2 id="wolfcha-title" className="text-2xl font-semibold tracking-tight">来一局狼人杀？</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">你与 7 位 AI 玩家同桌。从天黑、竞选警长到发言投票，玩一场真实的对局。</p>
          <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void run(() => startGame({ playerCount: 8, difficulty: "normal" })); }}>
            <label htmlFor="wolfcha-name" className="flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground">
              你的名字
              <input id="wolfcha-name" value={humanName} maxLength={24} onChange={(event) => setHumanName(event.target.value)} placeholder="你" className="h-10 w-44 max-w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-offset-2 focus-visible:outline-ring" />
            </label>
            <Button type="submit" disabled={busy} className="h-10 gap-2">{busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}开始 8 人局<ArrowRight className="size-4" aria-hidden="true" /></Button>
            <Button type="button" variant="outline" disabled={busy} className="h-10" onClick={() => void run(() => startGame({ playerCount: 8, isSpectatorMode: true }))}>观看 AI 对局</Button>
          </form>
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        <div className="min-w-0 px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="wolfcha-title" className="text-xl font-semibold tracking-tight">{isLoading ? "牌桌准备中" : phase === "GAME_END" ? (gameState.winner === "village" ? "好人获胜" : "狼人获胜") : `第 ${gameState.day} 天 · ${phase.startsWith("NIGHT_") ? "夜晚" : "白天"}`}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{phaseText}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"><Users className="size-3.5" aria-hidden="true" />{gameState.players.filter((player) => player.alive).length} 人存活</span>
              {phase !== "GAME_END" && <Button type="button" variant="ghost" size="sm" disabled={busy || isLoading} onClick={restart} className="gap-1"><RotateCcw className="size-3.5" aria-hidden="true" />放弃本局</Button>}
            </div>
          </div>

          {isLoading ? (
            <div className="mt-5 space-y-3 rounded-lg border border-border p-5 text-sm text-muted-foreground" role="status">
              <div className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{aiPlayers.some((player) => player.displayName) ? `AI 玩家准备中 · ${preparedCount}/${aiPlayers.length}` : "正在召集 AI 玩家…"}</div>
              <progress aria-label="AI 玩家准备进度" value={preparedCount} max={aiPlayers.length || 7} className="block h-1.5 w-full accent-foreground" />
            </div>
          ) : showReveal ? (
            <div className="mt-5 rounded-lg border border-border bg-muted/30 p-5">
              <p className="text-xs text-muted-foreground">你的身份 · {humanPlayer!.seat + 1} 号位</p>
              <p className="mt-2 text-2xl font-semibold">{roleName}</p>
              <p className="mt-2 text-sm text-muted-foreground">记住你的身份。确认后，第一夜开始。</p>
              <Button type="button" className="mt-4" disabled={busy} onClick={() => void run(async () => { setRevealedGameId(gameState.gameId); await continueAfterRoleReveal(); })}>进入第一夜<ArrowRight className="ml-2 size-4" aria-hidden="true" /></Button>
            </div>
          ) : (
            <>
              <div className="mt-5 grid min-w-0 gap-5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">{phase.startsWith("NIGHT_") ? <Moon className="size-3.5" aria-hidden="true" /> : <Sun className="size-3.5" aria-hidden="true" />}牌桌上的人</div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-2">
                    {gameState.players.map((player) => <div key={player.playerId} className={`min-w-0 rounded-md border px-2 py-2 text-xs ${player.alive ? "border-border bg-background" : "border-transparent opacity-45"}`}>
                      <div className="truncate font-medium">{player.seat + 1} · {player.displayName || "准备中"}{gameState.badge.holderSeat === player.seat && " · 警长"}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{player.isHuman ? `你 · ${roleName}` : phase === "GAME_END" ? t(`roles.${roleKeys[player.role]}`) : humanPlayer && isWolfRole(humanPlayer.role) && isWolfRole(player.role) ? "狼队" : player.alive ? "存活" : "出局"}</div>
                    </div>)}
                  </div>
                  {humanPlayer?.role === "Seer" && !!gameState.nightActions.seerHistory?.length && <div className="mt-3 border-t border-border pt-3 text-xs leading-6 text-muted-foreground"><p className="font-medium text-foreground">我的查验记录</p>{gameState.nightActions.seerHistory.map((result) => <p key={`${result.day}:${result.targetSeat}`}>第 {result.day} 夜 · {result.targetSeat + 1} 号 · {result.isWolf ? "狼人" : "好人"}</p>)}</div>}
                </div>

                <div className="min-w-0">
                  <div ref={logRef} className="max-h-64 min-h-36 space-y-2 overflow-y-auto rounded-lg border border-border p-3" aria-label="对局记录" aria-live="polite">
                    {visibleMessages.length === 0 && <p className="text-sm text-muted-foreground">对局正在开始…</p>}
                    {visibleMessages.map((message) => <div key={message.id} className="whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">{formatDailySummaryTranscriptMessage(message, gameState, "主持人")}</div>)}
                  </div>
                  {currentDialogue && <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-sm leading-6" aria-live="polite"><span className="font-medium">{currentDialogue.speaker} · </span><span className="break-words">{currentDialogue.text}</span></div>}
                  {isWaitingForAI && <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />AI 正在思考…</p>}
                </div>
              </div>

              {needsInput && <div className="mt-5 border-t border-border pt-4">
                <p className="mb-3 text-sm font-medium">轮到你行动</p>
                {phase === "DAY_BADGE_SIGNUP" && <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void run(() => handleBadgeSignup(true))}>报名竞选</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => handleBadgeSignup(false))}>不报名</Button></div>}
                {myTurn && <div className="space-y-2"><form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (inputText.trim()) void run(handleHumanSpeech); }}><input aria-label="你的发言" value={inputText} onChange={(event) => setInputText(event.target.value)} placeholder="说出你的判断…" className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-offset-2 focus-visible:outline-ring" /><Button type="submit" disabled={busy || !inputText.trim()}>发送发言</Button></form><Button type="button" variant="outline" disabled={busy} onClick={() => void run(handleFinishSpeaking)}>结束发言</Button></div>}
                {phase === "NIGHT_WITCH_ACTION" && <div className="space-y-3">{gameState.nightActions.wolfTarget !== undefined && <p className="text-sm text-muted-foreground">今晚被袭击：{gameState.nightActions.wolfTarget + 1} 号位 · {gameState.players.find((player) => player.seat === gameState.nightActions.wolfTarget)?.displayName}</p>}<div className="flex flex-wrap gap-2">{!gameState.roleAbilities.witchHealUsed && gameState.nightActions.wolfTarget !== undefined && <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => handleNightAction(gameState.nightActions.wolfTarget!, "save"))}>使用解药</Button>}{!gameState.roleAbilities.witchPoisonUsed && <Button type="button" variant="outline" disabled={busy || !selectedPlayer} onClick={() => { const seat = selectedPlayer!.seat; setSelection(null); void run(() => handleNightAction(seat, "poison")); }}>毒杀所选玩家</Button>}<Button type="button" variant="ghost" disabled={busy} onClick={() => void run(() => handleNightAction(-1, "pass"))}>不用药</Button></div></div>}
                {candidates.length > 0 && <div className="mt-3"><p className="mb-2 text-xs text-muted-foreground">选择目标</p><div className="flex flex-wrap gap-2">{candidates.map((player) => <Button key={player.playerId} type="button" size="sm" variant={selectedSeat === player.seat ? "default" : "outline"} aria-pressed={selectedSeat === player.seat} onClick={() => setSelection({ phase, seat: player.seat })}>{player.seat + 1} · {player.displayName}</Button>)}</div></div>}
                {selectedPlayer && phase !== "NIGHT_WITCH_ACTION" && <Button type="button" className="mt-3" disabled={busy} onClick={confirmTarget}>{phase === "DAY_VOTE" || phase === "DAY_BADGE_ELECTION" ? "确认投票" : "确认目标"}</Button>}
                {phase === "BADGE_TRANSFER" && <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => void run(() => handleHumanBadgeTransfer(-1))}>撕毁警徽</Button>}
                {phase === "HUNTER_SHOOT" && <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => void run(() => handleNightAction(-1))}>不开枪</Button>}
                {phase === "WHITE_WOLF_KING_BOOM" && <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => void run(() => handleNightAction(-1))}>不带走其他人</Button>}
                {phase === "NIGHT_SEER_ACTION" && gameState.nightActions.seerTarget !== undefined && <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => void run(next)}>看完结果，继续</Button>}
              </div>}

              {humanPlayer?.role === "WhiteWolfKing" && humanPlayer.alive && !gameState.roleAbilities.whiteWolfKingBoomUsed && speechPhases.includes(phase) && <Button type="button" variant="outline" className="mt-4" disabled={busy} onClick={() => void run(handleWhiteWolfKingBoom)}>白狼王自爆</Button>}
              {!needsInput && phase !== "GAME_END" && (currentDialogue || waitingForNextRound) && <Button type="button" variant="outline" className="mt-4" disabled={busy || isWaitingForAI} onClick={() => void run(next)}>开始下一步<ArrowRight className="ml-2 size-4" aria-hidden="true" /></Button>}
              {phase === "GAME_END" && <Button type="button" className="mt-5" onClick={restart}>再来一局<RotateCcw className="ml-2 size-4" aria-hidden="true" /></Button>}
              {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}

export default function WolfchaGame() {
  return <Provider><NextIntlClientProvider locale="zh" messages={messages}><Table /><Toaster position="bottom-center" /></NextIntlClientProvider></Provider>;
}
