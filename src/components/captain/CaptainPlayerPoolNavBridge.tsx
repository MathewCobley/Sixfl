// ========================================
// File: src/components/captain/CaptainPlayerPoolNavBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function CaptainPlayerPoolNavBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const match = pathname?.match(/^\/captain\/team\/([^/]+)/);
    if (!match) return;

    const teamId = match[1];
    const href = `/captain/team/${teamId}/player-pool`;

    function ensureLink() {
      const nav = document.querySelector(".captain-team-nav");
      if (!(nav instanceof HTMLElement)) return;

      const existing = nav.querySelector<HTMLAnchorElement>(
        'a[data-sixfl-player-pool-nav="true"]',
      );

      if (existing) {
        existing.href = href;
        return;
      }

      const link = document.createElement("a");
      link.href = href;
      link.textContent = "PlayerPool";
      link.dataset.sixflPlayerPoolNav = "true";
      link.className =
        "rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/40 hover:bg-emerald-500/15";

      const squadLink = Array.from(nav.querySelectorAll("a")).find(
        (item) => item.textContent?.trim() === "Squad",
      );

      if (squadLink?.nextSibling) {
        nav.insertBefore(link, squadLink.nextSibling);
      } else {
        nav.appendChild(link);
      }
    }

    ensureLink();
    const observer = new MutationObserver(ensureLink);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document
        .querySelectorAll('a[data-sixfl-player-pool-nav="true"]')
        .forEach((item) => item.remove());
    };
  }, [pathname]);

  return null;
}
