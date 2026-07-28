// ========================================
// File: src/components/captain/CaptainPlayerPoolNavBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const SIXFL_TV_LOGO_PATH = "/Sixfl-tv.png";

export default function CaptainPlayerPoolNavBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const match = pathname?.match(/^\/captain\/team\/([^/]+)/);
    if (!match) return;

    const teamId = match[1];
    const playerPoolHref = `/captain/team/${teamId}/player-pool`;
    const tvHref = `/captain/team/${teamId}/tv`;

    function ensureCaptainTabs() {
      const nav = document.querySelector(".captain-team-nav");
      if (!(nav instanceof HTMLElement)) return;

      let playerPoolLink = nav.querySelector<HTMLAnchorElement>(
        `a[href="${playerPoolHref}"]`,
      );

      if (!playerPoolLink) {
        playerPoolLink = document.createElement("a");
        playerPoolLink.href = playerPoolHref;
        playerPoolLink.dataset.sixflPlayerPoolNav = "true";
        playerPoolLink.className =
          "rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-emerald-400/25 hover:bg-emerald-500/10 hover:text-emerald-100";

        const prospectsLink = Array.from(nav.querySelectorAll("a")).find(
          (item) => item.textContent?.trim() === "Prospects",
        );

        if (prospectsLink?.nextSibling) {
          nav.insertBefore(playerPoolLink, prospectsLink.nextSibling);
        } else if (prospectsLink) {
          nav.appendChild(playerPoolLink);
        } else {
          const squadLink = Array.from(nav.querySelectorAll("a")).find(
            (item) => item.textContent?.trim() === "Squad",
          );
          if (squadLink?.nextSibling) {
            nav.insertBefore(playerPoolLink, squadLink.nextSibling);
          } else {
            nav.appendChild(playerPoolLink);
          }
        }
      }

      playerPoolLink.textContent = "PlayerPool";
      playerPoolLink.setAttribute("aria-label", "PlayerPool");
      playerPoolLink.title = "PlayerPool";

      const tvLink = nav.querySelector<HTMLAnchorElement>(`a[href="${tvHref}"]`);
      if (tvLink && !tvLink.querySelector('img[data-sixfl-tv-nav-logo="true"]')) {
        const image = document.createElement("img");
        image.src = SIXFL_TV_LOGO_PATH;
        image.alt = "SIXFL TV";
        image.dataset.sixflTvNavLogo = "true";
        image.className = "h-5 w-auto max-w-[5rem] object-contain";
        tvLink.replaceChildren(image);
        tvLink.setAttribute("aria-label", "SIXFL TV");
        tvLink.title = "SIXFL TV";
      }
    }

    ensureCaptainTabs();
    const observer = new MutationObserver(ensureCaptainTabs);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
