// ========================================
// File: src/components/captain/HideImpossibleLeaguePositionBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getTeamIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/captain\/team\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

function findPositionBadges() {
  return Array.from(document.querySelectorAll<HTMLElement>("span")).filter((element) =>
    /^Position\s+\d+(st|nd|rd|th)$/i.test(element.textContent?.trim() ?? ""),
  );
}

async function getCurrentTableCount(teamId: string) {
  const response = await fetch(`/api/captain/team/${teamId}/fixture-badges`, {
    cache: "no-store",
  });

  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as {
    relatedTeamIds?: string[];
    fixtures?: Array<{ id: string }>;
  } | null;

  return Array.isArray(payload?.fixtures) ? payload.fixtures.length : null;
}

export default function HideImpossibleLeaguePositionBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamIdFromPathname(pathname);
    if (!teamId) return;

    let cancelled = false;

    const run = async () => {
      const badges = findPositionBadges();
      if (badges.length === 0) return;

      const tableCount = await getCurrentTableCount(teamId);
      if (cancelled) return;

      for (const badge of badges) {
        const match = /Position\s+(\d+)/i.exec(badge.textContent?.trim() ?? "");
        const displayedPosition = match ? Number(match[1]) : 0;

        if (!Number.isFinite(displayedPosition) || displayedPosition <= 0) continue;

        if (tableCount !== null && displayedPosition > tableCount) {
          badge.remove();
        } else {
          badge.textContent = `${badge.textContent?.replace(/^Position\s+/i, "")} in table`;
        }
      }
    };

    const frame = window.requestAnimationFrame(() => void run());
    const timer = window.setTimeout(() => void run(), 600);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
