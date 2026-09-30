"use client";

import { Dock, DockIcon } from "@/components/magicui/dock";
import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DATA } from "@/data/resume";
import Image from "next/image";

const qrPopoverClass = "pointer-events-auto fixed bottom-24 left-1/2 top-auto right-auto m-0 w-[min(20rem,calc(100vw-2rem))] max-h-[calc(100dvh-7rem)] -translate-x-1/2 overflow-auto rounded-xl border border-border bg-card p-2 shadow-2xl";

export default function Navbar() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center">
      <Dock className="z-50 pointer-events-auto relative h-14 p-1 gap-0.5 max-[359px]:gap-0 max-[359px]:p-0 max-[359px]:scale-[.98] sm:p-2 sm:gap-2 w-fit mx-0 flex border bg-card/90 backdrop-blur-3xl shadow-[0_0_10px_3px] shadow-primary/5">
        {DATA.navbar.map((item) => {
          const isExternal = item.href.startsWith("http");
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <a
                  href={item.href}
                  aria-label={item.label}
                  target={isExternal ? "_blank" : undefined}
                  rel={isExternal ? "noopener noreferrer" : undefined}
                >
                  <DockIcon className="rounded-3xl cursor-pointer size-full bg-background p-0 text-muted-foreground hover:text-foreground hover:bg-muted backdrop-blur-3xl border border-border transition-colors">
                    <item.icon className="size-full rounded-sm overflow-hidden object-contain" />
                  </DockIcon>
                </a>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                sideOffset={8}
                className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] dark:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]"
              >
                <p>{item.label}</p>
                <TooltipArrow className="fill-primary" />
              </TooltipContent>
            </Tooltip>
          );
        })}
        <Separator
          orientation="vertical"
          className="h-2/3 m-auto w-px bg-border"
        />
        {Object.entries(DATA.contact.social)
          .filter(([_, social]) => social.navbar)
          .map(([name, social], index) => {
            const isExternal = social.url.startsWith("http");
            const IconComponent = social.icon;
            const icon = (
              <DockIcon className="rounded-3xl cursor-pointer size-full bg-background p-0 text-muted-foreground hover:text-foreground hover:bg-muted backdrop-blur-3xl border border-border transition-colors">
                <IconComponent className="size-full rounded-sm overflow-hidden object-contain" />
              </DockIcon>
            );
            return (
              <Tooltip key={`social-${name}-${index}`}>
                <TooltipTrigger asChild>
                  {"qr" in social ? (
                    <button type="button" popoverTarget={`${name.toLowerCase()}-qr`} aria-label={social.name}>
                      {icon}
                    </button>
                  ) : (
                    <a
                      href={social.url}
                      aria-label={social.name}
                      target={isExternal ? "_blank" : undefined}
                      rel={isExternal ? "noopener noreferrer" : undefined}
                    >
                      {icon}
                    </a>
                  )}
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={8}
                  className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] dark:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]"
                >
                  <p>{social.name}</p>
                  <TooltipArrow className="fill-primary" />
                </TooltipContent>
              </Tooltip>
            );
          })}
        <Separator
          orientation="vertical"
          className="h-2/3 m-auto w-px bg-border"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <DockIcon className="rounded-3xl cursor-pointer size-full bg-background p-0 text-muted-foreground hover:text-foreground hover:bg-muted backdrop-blur-3xl border border-border transition-colors">
              <ModeToggle className="size-full cursor-pointer" />
            </DockIcon>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            sideOffset={8}
            className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] dark:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]"
          >
            <p>切换主题</p>
            <TooltipArrow className="fill-primary" />
          </TooltipContent>
        </Tooltip>
      </Dock>
      <div
        id="wechat-qr"
        popover="auto"
        className={qrPopoverClass}
      >
        <Image
          src="/wechat-qr.jpg"
          alt="微信 meolord 的好友二维码"
          width={888}
          height={1131}
          className="h-auto w-full rounded-lg"
        />
      </div>
      <div id="xiaohongshu-qr" popover="auto" className={qrPopoverClass}>
        <div className="relative mx-auto size-60 overflow-hidden rounded-lg bg-white">
          <Image
            src="/xiaohongshu-qr.jpg"
            alt="小红书 猫大人 的二维码"
            width={938}
            height={1280}
            unoptimized
            className="absolute left-[-630px] top-[-970px] h-[1280px] w-[938px] max-w-none"
          />
        </div>
        <p className="py-2 text-center text-sm">小红书 · 猫大人 · 4930867108</p>
      </div>
      <div id="douyin-qr" popover="auto" className={qrPopoverClass}>
        <div className="relative mx-auto size-64 overflow-hidden rounded-full bg-[#838383]">
          <Image
            src="/douyin-qr.jpg"
            alt="抖音 猫大人 的二维码"
            width={857}
            height={1280}
            unoptimized
            className="absolute left-[-68px] top-[-83px] h-[585px] w-[392px] max-w-none"
          />
        </div>
        <p className="py-2 text-center text-sm">抖音 · 猫大人 · 1079872772</p>
      </div>
    </div>
  );
}
