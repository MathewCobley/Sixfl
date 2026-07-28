// ========================================
// File: src/components/captain/CaptainPlayerPoolNavBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PLAYER_POOL_LOGO_URL = "/logos/sixfl%20player%20pool%20.png";

function applyPlayerPoolLogo(link: HTMLAnchorElement) {
  link.setAttribute("aria-label", "SIXFL PlayerPool");
  link.title = "SIXFL PlayerPool";

  let logo = link.querySelector<HTMLImageElement>(
    'img[data-sixfl-player-pool-logo="true"]',
  );

  if (!logo) {
    link.textContent = "";
    logo = document.createElement("img");
    logo.src = PLAYER_POOL_LOGO_URL;
    logo.alt = "SIXFL PlayerPool";
    logo.dataset.sixflPlayerPoolLogo = "true";
    logo.className = "h-6 w-auto max-w-[7.5rem] object-contain";
    link.appendChild(logo);
  }
}

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
        applyPlayerPoolLogo(existing);
        return;
      }

      const link = document.createElement("a");
      link.href = href;
      link.dataset.sixflPlayerPoolNav = "true";
      link.className =
        "inline-flex min-h-10 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 transition hover:border-emerald-400/40 hover:bg-emerald-500/15";
      applyPlayerPoolLogo(link);

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
