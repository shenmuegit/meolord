"use client";

import dynamic from "next/dynamic";

const WolfchaGame = dynamic(() => import("./wolfcha-game"), {
  ssr: false,
  loading: () => <p className="px-5 py-8 text-sm text-muted-foreground">正在打开牌桌…</p>,
});

export default function WolfchaSection() {
  return (
    <section id="wolfcha" aria-labelledby="wolfcha-title" className="scroll-mt-8">
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card ring-2 ring-border/20">
        <WolfchaGame />
      </div>
    </section>
  );
}
