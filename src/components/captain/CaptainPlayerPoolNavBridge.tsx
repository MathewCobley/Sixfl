// ========================================
// File: src/components/captain/CaptainPlayerPoolNavBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const SIXFL_TV_LOGO_PATH = "/Sixfl-tv.png";

export default function CaptainPlayerPoolNavBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const match = pathname?.match(/^\/captain\/team\/([^/]+)/);
    if (!match) return;

    const teamId = match[1];
    const playerPoolHref = `/captain/team/${teamId}/player-pool`;
    const tvHref = `/captain/team/${teamId}/tv`;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    function openPlayerPool(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      router.push(playerPoolHref);
    }

    function ensureCaptainTabs() {
      const nav = document.querySelector(".captain-team-nav");
      if (!(nav instanceof HTMLElement)) return false;

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
      playerPoolLink.onclick = openPlayerPool;

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

      return true;
    }

    function run() {
      if (cancelled) return;

      attempts += 1;
      const ready = ensureCaptainTabs();

      if (!ready && attempts < 8) {
        retryTimer = setTimeout(run, 75);
      }
    }

    const frame = window.requestAnimationFrame(run);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [pathname, router]);

  return null;
}
