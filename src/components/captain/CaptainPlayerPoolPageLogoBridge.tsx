// ========================================
// File: src/components/captain/CaptainPlayerPoolPageLogoBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PLAYER_POOL_LOGO_URL = "/logos/sixfl%20player%20pool%20.png";

export default function CaptainPlayerPoolPageLogoBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.match(/^\/captain\/team\/[^/]+\/player-pool(?:\/|$)/)) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    function ensureLogo() {
      if (document.querySelector('[data-sixfl-player-pool-page-logo="true"]')) {
        return true;
      }

      const heading = Array.from(document.querySelectorAll("h1")).find((item) =>
        item.textContent?.includes("Available players for"),
      );
      const hero = heading?.closest("section");
      if (!(hero instanceof HTMLElement)) return false;

      const wrapper = document.createElement("div");
      wrapper.dataset.sixflPlayerPoolPageLogo = "true";
      wrapper.className = "mb-6 flex justify-center sm:justify-start";

      const image = document.createElement("img");
      image.src = PLAYER_POOL_LOGO_URL;
      image.alt = "SIXFL PlayerPool";
      image.className = "h-auto w-full max-w-[34rem] object-contain";

      wrapper.appendChild(image);
      hero.insertBefore(wrapper, hero.firstChild);
      return true;
    }

    function run() {
      if (cancelled) return;

      attempts += 1;
      const ready = ensureLogo();

      if (!ready && attempts < 8) {
        retryTimer = setTimeout(run, 75);
      }
    }

    const frame = window.requestAnimationFrame(run);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (retryTimer) clearTimeout(retryTimer);

      document
        .querySelectorAll('[data-sixfl-player-pool-page-logo="true"]')
        .forEach((item) => item.remove());
    };
  }, [pathname]);

  return null;
}
