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
        existing.textContent = "PlayerPool";
        existing.setAttribute("aria-label", "PlayerPool");
        existing.title = "PlayerPool";
        return;
      }

      const link = document.createElement("a");
      link.href = href;
      link.textContent = "PlayerPool";
      link.dataset.sixflPlayerPoolNav = "true";
      link.setAttribute("aria-label", "PlayerPool");
      link.title = "PlayerPool";
      link.className =
        "inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white";

      const prospectsLink = Array.from(nav.querySelectorAll("a")).find(
        (item) => item.textContent?.trim() === "Prospects",
      );

      if (prospectsLink) {
        nav.insertBefore(link, prospectsLink);
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
