// ========================================
// File: src/components/layout/PublicLeagueBadgeVisibilityBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const BADGE_SHELL_ATTRIBUTE = "data-public-league-badge-shell";
const BADGE_IMAGE_ATTRIBUTE = "data-public-league-badge-image";

export default function PublicLeagueBadgeVisibilityBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/leagues") return;

    const cardLinks = Array.from(
      document.querySelectorAll<HTMLElement>('main a[href^="/leagues/"]'),
    );

    const markedElements: HTMLElement[] = [];

    for (const card of cardLinks) {
      const hero = card.querySelector<HTMLElement>("div.relative.h-44");
      if (!hero) continue;

      const badgeImage = Array.from(hero.querySelectorAll<HTMLImageElement>("img")).find(
        (image) => image.className.includes("object-contain"),
      );

      const badgeShell = badgeImage?.parentElement;
      if (!badgeImage || !badgeShell) continue;

      badgeShell.setAttribute(BADGE_SHELL_ATTRIBUTE, "true");
      badgeImage.setAttribute(BADGE_IMAGE_ATTRIBUTE, "true");
      markedElements.push(badgeShell, badgeImage);
    }

    return () => {
      for (const element of markedElements) {
        element.removeAttribute(BADGE_SHELL_ATTRIBUTE);
        element.removeAttribute(BADGE_IMAGE_ATTRIBUTE);
      }
    };
  }, [pathname]);

  if (pathname !== "/leagues") return null;

  return (
    <style jsx global>{`
      [${BADGE_SHELL_ATTRIBUTE}="true"] {
        width: 5.5rem !important;
        height: 5.5rem !important;
        flex: 0 0 5.5rem !important;
        padding: 0.3rem !important;
        border-radius: 1.35rem !important;
        border-color: rgba(255, 255, 255, 0.24) !important;
        background:
          radial-gradient(circle at 50% 20%, rgba(16, 185, 129, 0.2), transparent 58%),
          rgba(0, 0, 0, 0.82) !important;
        box-shadow:
          0 16px 34px rgba(0, 0, 0, 0.52),
          0 0 0 1px rgba(16, 185, 129, 0.14),
          0 0 26px rgba(16, 185, 129, 0.14) !important;
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          box-shadow 180ms ease !important;
      }

      a:hover [${BADGE_SHELL_ATTRIBUTE}="true"] {
        transform: translateY(-2px) scale(1.04);
        border-color: rgba(52, 211, 153, 0.5) !important;
        box-shadow:
          0 20px 38px rgba(0, 0, 0, 0.58),
          0 0 0 1px rgba(52, 211, 153, 0.24),
          0 0 34px rgba(16, 185, 129, 0.22) !important;
      }

      [${BADGE_IMAGE_ATTRIBUTE}="true"] {
        padding: 0.3rem !important;
        filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.6));
      }

      @media (max-width: 420px) {
        [${BADGE_SHELL_ATTRIBUTE}="true"] {
          width: 4.75rem !important;
          height: 4.75rem !important;
          flex-basis: 4.75rem !important;
          border-radius: 1.15rem !important;
        }
      }
    `}</style>
  );
}
