// ========================================
// File: src/components/home/HomepageLeagueTypeFocusBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const CURRENT_LABEL = "MEN’S LEAGUES";
const FUTURE_LABELS = new Set(["WOMEN’S LEAGUES", "YOUTH LEAGUES"]);

function getOwnText(element: HTMLElement) {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function simplifyHomepageLeagueTypes(pathname: string | null) {
  if (pathname !== "/") return;

  const spans = Array.from(document.querySelectorAll<HTMLElement>("span"));

  for (const span of spans) {
    const ownText = getOwnText(span);

    if (FUTURE_LABELS.has(ownText)) {
      span.remove();
      continue;
    }

    if (ownText === CURRENT_LABEL) {
      for (const child of Array.from(span.children)) {
        if (child.textContent?.trim() === "•") child.remove();
      }
    }
  }
}

export default function HomepageLeagueTypeFocusBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    const apply = () => simplifyHomepageLeagueTypes(pathname);
    const frame = window.requestAnimationFrame(apply);
    const timer = window.setTimeout(apply, 350);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
