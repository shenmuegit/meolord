/* eslint-disable @next/next/no-img-element */
"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

function PreviewVideo({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const resume = () => {
      if (!document.hidden && video.paused) {
        void video.play().catch(() => {});
      }
    };

    video.addEventListener("pause", resume);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    resume();

    return () => {
      video.removeEventListener("pause", resume);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      autoPlay
      loop
      muted
      playsInline
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
    />
  );
}

function ProjectImage({ src, alt }: { src: string; alt: string }) {
  const [imageError, setImageError] = useState(false);

  if (!src || imageError) {
    return <div className="w-full h-48 bg-muted" />;
  }

  if (src === "/whalekey-hero@2x.png") {
    return (
      <svg
        className="whalekey-preview block h-48 w-full bg-[#0b2533]"
        viewBox="0 0 600 300"
        role="img"
        aria-label="WhaleKey：线框鲸鱼与动态粒子"
        preserveAspectRatio="xMidYMid meet"
      >
        <g className="whalekey-preview__whale">
          <image href={src} x="20" y="35" width="560" height="230" />
        </g>
        <g className="whalekey-preview__particles" fill="#9cdef5" stroke="#9cdef5" strokeOpacity=".5">
          <path d="M32 72 80 48 119 89 171 57" fill="none" />
          <circle cx="32" cy="72" r="3" />
          <circle cx="80" cy="48" r="2" />
          <circle cx="119" cy="89" r="3" />
          <circle cx="171" cy="57" r="2" />
        </g>
        <g className="whalekey-preview__particles whalekey-preview__particles--second" fill="#c1e0ed" stroke="#c1e0ed" strokeOpacity=".45">
          <path d="M404 233 452 202 506 228 556 190" fill="none" />
          <circle cx="404" cy="233" r="2" />
          <circle cx="452" cy="202" r="3" />
          <circle cx="506" cy="228" r="2" />
          <circle cx="556" cy="190" r="3" />
        </g>
      </svg>
    );
  }

  if (src === "/catgent/catgent-hero-desktop.webp") {
    return (
      <div
        className="relative flex h-48 w-full items-center overflow-hidden bg-[radial-gradient(circle_at_75%_30%,#edebff,transparent_42%),linear-gradient(90deg,#f7f9ff,#fff)] px-4"
        role="img"
        aria-label="Catgent 官网首屏，展示企业经营 Agent 与桌面端、手机端产品视频"
      >
        <div className="relative z-10 flex w-[45%] shrink-0 flex-col items-start">
          <span className="rounded-full border border-[#dfe0f7] bg-white/90 px-1.5 py-0.5 text-[6px] font-bold tracking-wider text-[#5b55cf]">
            ● CATGENT · 企业经营 AGENT
          </span>
          <strong className="mt-2 text-[13px] leading-[1.17] tracking-tight text-[#111c38]">
            让企业知识<br />与经营数据<br />
            <span className="text-[#6554db]">进入每一次决策。</span>
          </strong>
          <p className="mt-2 max-w-[145px] text-[6.5px] leading-[1.5] text-[#65718a]">
            从一个业务问题出发，连接内部资料、经营数据与专家能力。让分析有依据，让结果继续走向实际工作。
          </p>
          <span className="mt-2 rounded bg-[#564cdb] px-2 py-1 text-[6px] font-semibold text-white">
            了解工作方式 →
          </span>
          <span className="mt-2 flex gap-1 text-[5px] text-[#66718b]">
            <span className="rounded-full border border-[#dfe0f7] px-1">企业知识检索</span>
            <span className="rounded-full border border-[#dfe0f7] px-1">经营数据查询</span>
            <span className="rounded-full border border-[#dfe0f7] px-1">专家协作</span>
          </span>
        </div>
        <div className="relative h-[148px] min-w-0 flex-1">
          <div className="absolute right-0 top-1/2 w-[92%] aspect-[1080/680] -translate-y-1/2 overflow-hidden rounded-md border border-[#cbd4ff] bg-white shadow-lg">
            <img src={src} alt="" className="h-full w-full object-cover" />
            <PreviewVideo src="/catgent/catgent-hero-desktop-loop.mp4" poster={src} />
          </div>
          <div className="absolute bottom-1 left-[8%] h-[82%] aspect-[320/686] overflow-hidden rounded-lg border border-[#cbd4ff] bg-white shadow-xl">
            <img src="/catgent/catgent-hero.webp" alt="" className="h-full w-full object-cover" />
            <PreviewVideo src="/catgent/catgent-hero-loop.mp4" poster="/catgent/catgent-hero.webp" />
          </div>
        </div>
      </div>
    );
  }

  if (src === "/livepilot/hero-poster.webp") {
    return (
      <div
        className="relative h-48 w-full overflow-hidden bg-[#020b13]"
        role="img"
        aria-label="LivePilot 官网首屏：每场直播都能回到关键时刻，背景视频与直播复盘界面"
      >
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <PreviewVideo src="/livepilot/hero-background-loop.mp4" poster={src} />
        <div className="absolute inset-0 bg-linear-to-r from-black/50 via-black/10 to-transparent" />
        <div className="absolute left-[7%] top-[25%] z-10 w-[38%] text-white">
          <strong className="block text-[13px] leading-[1.08] tracking-tight sm:text-[16px]">
            每场直播，<br />都能回到<br />关键时刻。
          </strong>
          <span className="mt-2 block text-[6px] text-white/75 sm:text-[7px]">
            录像 × 时序数据
          </span>
          <span className="mt-2 block border-t border-white/25 pt-1.5 text-[7px] font-medium sm:text-[8px]">
            查看产品示意 ↗
          </span>
        </div>
        <img
          src="/livepilot/workbench.png"
          alt=""
          className="absolute left-[42%] top-[29%] w-[60%] rounded border border-white/15 shadow-2xl"
        />
        <img
          src="/livepilot/replay.png"
          alt=""
          className="absolute left-[52%] top-[17%] w-[51%] rounded border border-white/15 shadow-2xl"
        />
      </div>
    );
  }

  if (src === "/grove/hero-demo-poster.png") {
    return (
      <div
        className="flex h-48 w-full items-center gap-2 overflow-hidden bg-[#f2f4f9] px-4"
        role="img"
        aria-label="Grove 官网首屏：左侧产品介绍，右侧知识脑图演示视频"
      >
        <div className="w-[46%] shrink-0">
          <span className="rounded-full border border-[#e1e7f0] px-1.5 py-1 text-[6px] text-[#6f7f9a]">
            Grove · 本地知识工作台
          </span>
          <strong className="mt-2 block text-[13px] font-medium leading-[1.3] text-[#132b52]">
            让知识与技能，<br />长成自己的脉络。
          </strong>
          <p className="mt-2 text-[6.5px] leading-[1.5] text-[#7284a0]">
            把读过的资料整理成可回看的知识脉络，随手记下尚未成形的想法。
          </p>
          <span className="mt-2 inline-block rounded bg-[#102c58] px-2 py-1 text-[6px] font-medium text-white">
            了解 Grove
          </span>
        </div>
        <div className="relative aspect-[1586/992] min-w-0 flex-1 overflow-hidden rounded-md border border-white bg-[#f6efe8] shadow-lg">
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <PreviewVideo src="/grove/hero-demo-loop.mp4" poster={src} />
        </div>
      </div>
    );
  }

  if (src === "/hylia/orchard-film-poster.jpg") {
    return (
      <div
        className="relative h-48 w-full overflow-hidden bg-[#324322] text-white"
        style={{ containerType: "inline-size" }}
        role="img"
        aria-label="Hylia 果干品牌独立站首屏：果园影像与品牌字样"
      >
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <PreviewVideo src="/hylia/orchard-film-loop.mp4" poster={src} />
        <div className="absolute inset-0 bg-linear-to-b from-[#0c150c]/40 via-[#0c150c]/20 to-[#0c150c]/40" />
        <div className="absolute inset-x-3 top-2 flex items-center justify-between gap-2 text-[5px]">
          <span className="whitespace-nowrap">品牌理念　果味系列　发现好果</span>
          <span className="flex items-center gap-0.5">
            <img src="/hylia/hedgehog-mark-new.png" alt="" className="h-3 w-3 object-contain" />
            <img src="/hylia/hylia-wordmark-new.png" alt="" className="h-3 w-9 object-contain brightness-0 invert" />
          </span>
          <span className="whitespace-nowrap">联系我们　合作咨询 ↗</span>
        </div>
        <div className="absolute inset-x-3 top-6 border-y border-white/35 py-1 text-center text-[5px] tracking-wider">
          把水果的美好，留在每一个日常。
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          <strong
            className="font-normal leading-none tracking-tight"
            style={{ fontFamily: '"Hylia Bodoni", Bodoni, Didot, serif', fontSize: "10cqw" }}
          >
            hylia
          </strong>
          <span className="mt-1 text-[5px] tracking-wider">果干 · 果脯 · 冻干水果 · 坚果</span>
        </div>
        <div className="absolute inset-x-3 bottom-2 flex justify-between text-[5px]">
          <span>向下，发现美好</span>
          <span>一颗水果，一段好时光。</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-48 object-cover"
      onError={() => setImageError(true)}
    />
  );
}

interface Props {
  title: string;
  href?: string;
  description: string;
  dates: string;
  tags: readonly string[];
  link?: string;
  image?: string;
  video?: string;
  links?: readonly {
    icon: React.ReactNode;
    type: string;
    href: string;
  }[];
  className?: string;
}

export function ProjectCard({
  title,
  href,
  description,
  dates,
  tags,
  link,
  image,
  video,
  links,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col h-full border border-border rounded-xl overflow-hidden hover:ring-2 cursor-pointer hover:ring-muted transition-all duration-200",
        className
      )}
    >
      <div className="relative shrink-0">
        <Link
          href={href || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
          aria-label={`查看 ${title}`}
        >
          {video ? (
            <video
              src={video}
              poster={image || undefined}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-48 object-cover"
            />
          ) : image ? (
            <ProjectImage src={image} alt={title} />
          ) : (
            <div className="w-full h-48 bg-muted" />
          )}
        </Link>
        {links && links.length > 0 && (
          <div className="absolute top-2 right-2 flex flex-wrap gap-2">
            {links.map((link, idx) => (
              <Link
                href={link.href}
                key={idx}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <Badge
                  className="flex items-center gap-1.5 text-xs bg-black text-white hover:bg-black/90"
                  variant="default"
                >
                  {link.icon}
                  {link.type}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="p-6 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">{title}</h3>
            {dates && <time className="text-xs text-muted-foreground">{dates}</time>}
          </div>
          <Link
            href={href || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            aria-label={`查看 ${title}`}
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="text-xs flex-1 prose max-w-full text-pretty font-sans leading-relaxed text-muted-foreground dark:prose-invert">
          <Markdown>{description}</Markdown>
        </div>
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto">
            {tags.map((tag) => (
              <Badge
                key={tag}
                className="text-[11px] font-medium border border-border h-6 w-fit px-2"
                variant="outline"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
