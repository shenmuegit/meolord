"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ensureCookie(name: string, persistent: boolean) {
  const existing = document.cookie.split("; ").find((part) => part.startsWith(name + "="))?.slice(name.length + 1);
  if (existing && uuid.test(existing)) return;
  document.cookie = `${name}=${crypto.randomUUID()}; Path=/; SameSite=Lax${persistent ? "; Max-Age=31536000" : ""}${location.protocol === "https:" ? "; Secure" : ""}`;
}

function record(kind: "pageview" | "click", label: string | null = null, href: string | null = null) {
  ensureCookie("visitor_id", true);
  ensureCookie("visit_id", false);
  const device = kind === "pageview" ? {
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: [screen.width, screen.height],
    viewport: [innerWidth, innerHeight],
    pixelRatio: devicePixelRatio,
    touchPoints: navigator.maxTouchPoints,
  } : null;
  void fetch("/api/visitor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: crypto.randomUUID(), kind, path: location.pathname, label, href, device }),
    keepalive: true,
  }).catch(() => {});
}

export default function VisitorTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname && lastPath.current !== pathname) {
      lastPath.current = pathname;
      record("pageview");
    }
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest("a, button, [role=button], summary");
      if (!control) return;
      const label = (control.getAttribute("aria-label") || control.getAttribute("title") || control.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200);
      const href = control instanceof HTMLAnchorElement ? control.getAttribute("href")?.slice(0, 500) ?? null : null;
      record("click", label || null, href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
