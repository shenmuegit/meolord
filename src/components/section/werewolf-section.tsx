"use client";

import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  ChevronUp,
  Eye,
  FlaskConical,
  Link2,
  Moon,
  MoonStar,
  Plus,
  Users,
  Wheat,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const players = ["你", "小林", "阿澈", "知秋", "南风", "白露", "小满", "远山", "青禾"];
const roleCards = [
  { name: "女巫", Icon: FlaskConical, className: "left-0 top-3 -rotate-15" },
  { name: "预言家", Icon: Eye, className: "left-11 top-0 rotate-3" },
  { name: "狼人", Icon: MoonStar, className: "left-20 top-5 rotate-15 bg-muted" },
];
const sampleSpeeches = [
  { seat: 2, name: "小林", text: "先听大家聊聊吧，我是好人。第一天信息不多，别急着跟票。" },
  { seat: 3, name: "阿澈", text: "我想听听 5 号怎么说。他刚才一直在替 7 号解释，这两个人的关系值得留意。" },
  { seat: 5, name: "南风", text: "替别人解释不代表认识他。我的判断依据是发言，1 号，你觉得呢？" },
];

export default function WerewolfSection() {
  const [screen, setScreen] = useState<"entry" | "lobby" | "game">("entry");
  const [multiplayer, setMultiplayer] = useState(false);
  const [roomCode, setRoomCode] = useState("267418");
  const [speech, setSpeech] = useState("");
  const [skipped, setSkipped] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isEntry = screen === "entry" || collapsed;
  const turnFinished = Boolean(speech) || skipped;

  function startGame(withFriends: boolean) {
    setMultiplayer(withFriends);
    setSpeech("");
    setSkipped(false);
    setCollapsed(false);
    setScreen("game");
  }

  function openLobby() {
    setMultiplayer(true);
    setCollapsed(false);
    setScreen("lobby");
  }

  return (
    <section id="werewolf" aria-labelledby="werewolf-title" className="scroll-mt-8">
      <Card
        className={cn(
          "relative rounded-xl border border-border ring-2 ring-border/20",
          !isEntry && "md:left-1/2 md:w-[min(56rem,calc(100vw-3rem))] md:-translate-x-1/2"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 sm:px-6">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Moon className="size-3.5" aria-hidden="true" />
            <span>狼人茶会</span>
            <span className="ml-1 text-[10px] font-normal tracking-[0.14em] text-muted-foreground">WOLFCHA</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">交互预览</span>
            {!isEntry && (
              <Button variant="ghost" size="sm" className="h-9 gap-1 px-2" onClick={() => setCollapsed(true)} aria-expanded>
                <ChevronUp className="size-3.5" aria-hidden="true" />收起
              </Button>
            )}
          </div>
        </div>

        {isEntry ? (
          <div className="relative px-5 pb-4 pt-6 sm:px-6">
            <div className="relative z-10 min-[420px]:pr-36 sm:pr-44">
              <h2 id="werewolf-title" className="text-2xl font-semibold tracking-tight sm:text-[28px]">来一局狼人杀？</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">一个人也能开局，朋友来了就一起玩。<br />其余座位，让 AI 来坐。</p>
            </div>
            <div className="pointer-events-none absolute right-3 top-6 hidden h-36 w-40 min-[420px]:block sm:right-6" aria-hidden="true">
              {roleCards.map(({ name, Icon, className }) => (
                <div key={name} className={cn("absolute flex h-28 w-20 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card text-muted-foreground shadow-sm after:absolute after:inset-1.5 after:rounded-sm after:border after:border-border/70", className)}>
                  <Icon className="size-7 stroke-1" />
                  <span className="text-xs">{name}</span>
                </div>
              ))}
            </div>
            <div className="relative z-10 mt-6 flex flex-wrap gap-2.5">
              <Button className="min-h-11 gap-2 sm:min-h-10" onClick={() => collapsed ? setCollapsed(false) : startGame(false)}>
                {collapsed ? screen === "lobby" ? "返回房间" : "继续游戏" : "直接开局"}<ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <Button variant="outline" className="min-h-11 gap-2 sm:min-h-10" onClick={openLobby}>
                <Users className="size-4" aria-hidden="true" />和朋友一起玩
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex -space-x-1.5" aria-hidden="true">
                  {["你", "AI", "AI"].map((label, index) => <span key={index} className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[9px] font-medium">{label}</span>)}
                </span>
                真人组局，AI 补位
              </div>
              <details className="group/join basis-full sm:basis-auto">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  有房间号？直接加入<ArrowUpRight className="size-3.5" aria-hidden="true" />
                </summary>
                <form className="mt-2 flex flex-wrap items-end gap-2 pb-2" onSubmit={(event) => {
                  event.preventDefault();
                  setRoomCode(String(new FormData(event.currentTarget).get("room")));
                  openLobby();
                }}>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="werewolf-room">示例房间号
                    <input id="werewolf-room" name="room" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="6 位数字" className="h-10 w-32 rounded-md border border-input bg-background px-3 text-base text-foreground outline-offset-2 focus-visible:outline-ring sm:text-sm" />
                  </label>
                  <Button type="submit" variant="outline" className="h-10">查看房间</Button>
                </form>
              </details>
            </div>
          </div>
        ) : screen === "lobby" ? (
          <div className="px-5 pb-6 pt-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><h2 id="werewolf-title" className="text-xl font-semibold tracking-tight sm:text-2xl">朋友到了，就开局。</h2><p className="mt-1.5 text-xs text-muted-foreground">示例房间 · 3 位玩家已就座 · 9 人局</p></div>
              <details>
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"><Link2 className="size-3.5" aria-hidden="true" />邀请朋友</summary>
                <p className="mt-2 text-xs text-muted-foreground">示例房间号 <span className="ml-1 font-mono text-base tracking-widest text-foreground">{roomCode}</span></p>
              </details>
            </div>
            <div className="my-6 grid grid-cols-3 gap-2 md:grid-cols-9" aria-label="三个示例玩家与六个由 AI 补齐的座位">
              {players.map((name, index) => (
                <div key={name} className={cn("rounded-lg border border-border px-1 py-3 text-center", index < 3 ? "bg-muted/40" : "border-dashed")}>
                  <span className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">{index < 3 ? name.slice(-1) : <Plus className="size-4" aria-hidden="true" />}</span>
                  <p className="text-xs font-medium">{index < 3 ? name : `${index + 1} 号位`}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{index === 0 ? "你 · 房主" : index < 3 ? "已就座" : "AI 可补位"}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
              <p className="text-xs text-muted-foreground">不用等满员，剩余 6 席由 AI 加入。</p>
              <Button className="min-h-11 gap-2" onClick={() => startGame(true)}>开始游戏<ArrowRight className="size-4" aria-hidden="true" /></Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-5 pt-5 sm:px-6">
              <div><h2 id="werewolf-title" className="text-xl font-semibold tracking-tight sm:text-2xl">天亮了，聊聊你的判断。</h2><p className="mt-1.5 text-xs text-muted-foreground">{multiplayer ? "3 位真人 · 6 位 AI" : "1 位真人 · 8 位 AI"}</p></div>
              <span className="text-[11px] text-muted-foreground">示例对局 · 第 1 天</span>
            </div>
            <div className="grid border-t border-border sm:grid-cols-[190px_minmax(0,1fr)] md:grid-cols-[230px_minmax(0,1fr)]">
              <aside className="border-b border-border bg-muted/20 p-4 sm:rounded-bl-xl sm:border-b-0 sm:border-r md:p-5" aria-label="玩家和你的身份">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>牌桌上的人</span><span>9 人存活</span></div>
                <div className="my-3 grid grid-cols-5 gap-1.5 sm:grid-cols-3">
                  {players.map((name, index) => (
                    <div key={name} className={cn("min-w-0 rounded-md border border-transparent px-0.5 py-2 text-center", index === 0 && "border-border bg-background")}>
                      <span className={cn("mx-auto mb-1.5 flex size-8 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground", index === 0 && "bg-primary text-primary-foreground")}>{name.slice(-1)}</span>
                      <p className="text-[11px] font-medium">{index + 1} · {name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{index === 0 ? "你" : multiplayer && index < 3 ? "朋友" : "AI"}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 border-t border-border pt-4"><span className="flex h-10 w-8 items-center justify-center rounded-md border border-border bg-background"><Wheat className="size-4 text-muted-foreground" aria-hidden="true" /></span><div><p className="text-[11px] text-muted-foreground">你的身份 · 仅你可见</p><p className="mt-0.5 text-sm font-medium">村民</p></div></div>
              </aside>
              <div className="min-w-0 p-4 sm:p-5 md:p-6">
                <div className="mb-5 flex items-center justify-between gap-2 border-b border-border pb-3 text-[11px] text-muted-foreground"><span>夜晚结束</span><span className="flex items-center gap-1.5 font-medium text-foreground"><span className="size-1.5 rounded-full bg-foreground" aria-hidden="true" />轮流发言</span><span>放逐投票</span></div>
                <div className="space-y-4" aria-label="示例发言">
                  {sampleSpeeches.map(({ seat, name, text }, index) => (
                    <div key={seat} className={cn(index === 2 && "rounded-lg bg-muted/50 p-3")}>
                      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium">{seat} 号 · {name}{(!multiplayer || seat > 3) && <span className="rounded border border-border px-1 text-[10px] font-normal leading-4 text-muted-foreground">AI</span>}</div>
                      <p className="text-sm leading-6 text-muted-foreground">{text}</p>
                    </div>
                  ))}
                  {speech && <div><p className="mb-1.5 text-xs font-medium">1 号 · 你</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{speech}</p></div>}
                </div>
                <form className="mt-5" onSubmit={(event) => {
                  event.preventDefault();
                  const text = String(new FormData(event.currentTarget).get("speech") ?? "").trim();
                  if (!text) return;
                  setSpeech(text);
                  event.currentTarget.reset();
                }}>
                  <label htmlFor="werewolf-speech" className="mb-2 block text-xs font-medium" role="status" aria-live="polite">{speech ? "你已发言，等待下一位玩家。" : skipped ? "你已跳过本轮发言。" : "轮到你了，说说你的看法。"}</label>
                  <textarea id="werewolf-speech" name="speech" rows={3} maxLength={500} required disabled={turnFinished} placeholder="你相信谁？又在怀疑谁？" className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 text-base leading-6 placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:bg-muted/30 disabled:opacity-60 sm:text-sm" />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="ghost" size="sm" className="min-h-10 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground" disabled={turnFinished} onClick={() => setSkipped(true)}>跳过本轮发言</Button><Button type="submit" size="sm" className="min-h-10 gap-2 px-4" disabled={turnFinished}>发言<ArrowUp className="size-3.5" aria-hidden="true" /></Button></div>
                </form>
              </div>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
