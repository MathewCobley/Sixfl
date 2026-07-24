// ========================================
// File: src/components/home/HomepageLeagueTypeFocusBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const CURRENT_LABEL = "MEN’S LEAGUES";
const FUTURE_LABELS = ["WOMEN’S LEAGUES", "YOUTH LEAGUES"];

function simplifyHomepageLeagueTypes(pathname: string | null) {
  if (pathname !== "/") return;

  const target = Array.from(document.querySelectorAll<HTMLElement>("div")).find(
    (element) => {
      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return (
        text.includes(CURRENT_LABEL) &&
        FUTURE_LABELS.every((label) => text.includes(label)) &&
        element.children.length >= 3
      );
    },
  );

  if (!target || target.dataset.leagueTypeFocusApplied === "true") return;

  const label = document.createElement("span");
  label.className = "inline-flex items-center";
  label.textContent = CURRENT_LABEL;

  target.replaceChildren(label);
  target.dataset.leagueTypeFocusApplied = "true";
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
