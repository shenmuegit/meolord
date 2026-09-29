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
    <section id="wolfcha" aria-label="狼人杀" className="relative w-full scroll-mt-8">
      <button type="button" aria-expanded={expanded} aria-controls="wolfcha-panel" onClick={() => { setOpened(true); setExpanded((value) => !value); }} className="mx-auto flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-medium shadow-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span aria-hidden="true" className="text-base leading-none">{expanded ? "−" : "+"}</span>
        {expanded ? "收起狼人杀" : "展开狼人杀"}
      </button>
      <div id="wolfcha-panel" hidden={!expanded} className="mt-4 min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm ring-2 ring-border/20 min-[1180px]:absolute min-[1180px]:left-[calc(100%+2rem)] min-[1180px]:top-0 min-[1180px]:mt-0 min-[1180px]:w-[min(50rem,calc(100vw-48rem))]">
        {opened && <WolfchaGame expanded={expanded} />}
      </div>
    </section>
  );
}
