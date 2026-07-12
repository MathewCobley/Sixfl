// ========================================
// File: src/components/captain/CaptainHeaderLeaguePositionBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type PositionPayload = {
  position: number | null;
  totalTeams: number;
  label: string | null;
};

function getTeamIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/captain\/team\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function removeExisting() {
  document.querySelectorAll("[data-captain-header-league-position]").forEach((element) => element.remove());
}

function findHeaderContainer() {
  const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find((element) =>
    element.textContent?.trim(),
  );

  return heading?.parentElement ?? null;
}

function renderBadge(payload: PositionPayload) {
  if (!payload.position || !payload.label || payload.totalTeams <= 0) return null;

  const badge = document.createElement("div");
  badge.dataset.captainHeaderLeaguePosition = "true";
  badge.className =
    "mt-3 inline-flex flex-wrap items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100";
  badge.innerHTML = `
    <span class="text-emerald-200/70">League position</span>
    <span>${payload.label}</span>
    <span class="text-emerald-100/55">of ${payload.totalTeams}</span>
  `;

  return badge;
}

async function loadPosition(teamId: string) {
  const response = await fetch(`/api/captain/team/${teamId}/league-position`, {
    cache: "no-store",
  });

  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as PositionPayload | null;
}

export default function CaptainHeaderLeaguePositionBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamIdFromPathname(pathname);

    if (!teamId) {
      removeExisting();
      return;
    }

    let cancelled = false;

    void loadPosition(teamId).then((payload) => {
      if (cancelled) return;
      removeExisting();

      if (!payload) return;

      const container = findHeaderContainer();
      const badge = renderBadge(payload);

      if (container && badge) {
        container.appendChild(badge);
      }
    });

    return () => {
      cancelled = true;
      removeExisting();
    };
  }, [pathname]);

  return null;
}
