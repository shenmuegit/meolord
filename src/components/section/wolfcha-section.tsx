"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const WolfchaGame = dynamic(() => import("./wolfcha-game"), {
  ssr: false,
  loading: () => <p className="px-5 py-8 text-sm text-muted-foreground">正在打开牌桌…</p>,
});

export default function WolfchaSection() {
  const [expanded, setExpanded] = useState(false);
  const [opened, setOpened] = useState(false);

  return (
    <>
      <button id="wolfcha" type="button" aria-expanded={expanded} aria-controls="wolfcha-panel" onClick={() => { setOpened(true); setExpanded((value) => !value); }} className="inline-flex min-h-9 -translate-y-1.5 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span aria-hidden="true" className="text-base leading-none">{expanded ? "−" : "+"}</span>
        {expanded ? "收起狼人杀" : "与他玩一盘狼人杀"}
      </button>
      <div id="wolfcha-panel" hidden={!expanded} className="mt-3 w-full min-w-0 bg-background min-[1260px]:absolute min-[1260px]:left-[calc(100%+0.75rem)] min-[1260px]:top-0 min-[1260px]:mt-0 min-[1260px]:w-[min(50rem,calc((100vw-39rem)/2-1.5rem))]">
        {opened && <WolfchaGame expanded={expanded} />}
      </div>
    </>
  );
}
