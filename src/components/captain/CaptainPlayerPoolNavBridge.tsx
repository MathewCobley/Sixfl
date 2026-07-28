// ========================================
// File: src/components/captain/CaptainPlayerPoolNavBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PLAYER_POOL_LOGO_PATH = "/logos/sixfl player pool .png";

export default function CaptainPlayerPoolNavBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const match = pathname?.match(/^\/captain\/team\/([^/]+)/);
    if (!match) return;

    const teamId = match[1];
    const href = `/captain/team/${teamId}/player-pool`;
    let observer: MutationObserver | null = null;

    function installLink() {
      const nav = document.querySelector(".captain-team-nav");
      if (!(nav instanceof HTMLElement)) return false;

      let link = nav.querySelector<HTMLAnchorElement>(
        'a[data-sixfl-player-pool-nav="true"]',
      );

      if (!link) {
        link = document.createElement("a");
        link.dataset.sixflPlayerPoolNav = "true";
        link.className =
          "inline-flex min-h-10 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 transition hover:border-emerald-400/40 hover:bg-emerald-500/15";

        const prospectsLink = Array.from(nav.querySelectorAll("a")).find(
          (item) => item.textContent?.trim() === "Prospects",
        );

        if (prospectsLink) {
          nav.insertBefore(link, prospectsLink);
        } else {
          nav.appendChild(link);
        }
      }

      link.href = href;
      link.setAttribute("aria-label", "SIXFL PlayerPool");
      link.title = "SIXFL PlayerPool";

      if (!link.querySelector('img[data-sixfl-player-pool-logo="true"]')) {
        const image = document.createElement("img");
        image.src = PLAYER_POOL_LOGO_PATH;
        image.alt = "";
        image.dataset.sixflPlayerPoolLogo = "true";
        image.className = "h-5 w-[104px] object-contain";
        link.replaceChildren(image);
      }

      observer?.disconnect();
      observer = null;
      return true;
    }

    if (!installLink()) {
      observer = new MutationObserver(() => {
        installLink();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      document
        .querySelectorAll('a[data-sixfl-player-pool-nav="true"]')
        .forEach((item) => item.remove());
    };
  }, [pathname]);

  return null;
}
