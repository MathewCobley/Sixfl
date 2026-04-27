// ========================================
// File: src/components/admin/communications/CommunicationsLeagueLauncher.tsx
// ========================================

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import CompactLauncherPicker from "@/components/admin/communications/CompactLauncherPicker";

type LeagueOption = {
  id: string;
  label: string;
};

export default function CommunicationsLeagueLauncher({ leagues }: { leagues: LeagueOption[] }) {
  const [selectedLeagueId, setSelectedLeagueId] = useState("");

  const selectedLeague = useMemo(
    () => leagues.find((league) => league.id === selectedLeagueId) ?? null,
    [leagues, selectedLeagueId],
  );

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            League communications
          </div>
          <h2 className="text-2xl font-semibold text-white">Open a whole-league broadcast page</h2>
          <p className="max-w-2xl text-sm text-white/60">
            Pick a league and queue one message across all teams in that league, with the history still written into each team record.
          </p>
        </div>

        {selectedLeague ? (
          <Link
            href={`/admin/leagues/${selectedLeague.id}/communications`}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Open league
          </Link>
        ) : null}
      </div>

      <div className="mt-5 max-w-3xl">
        <CompactLauncherPicker
          label="League"
          placeholder="Select a league"
          selectedId={selectedLeagueId}
          onSelect={setSelectedLeagueId}
          options={leagues.map((league) => ({
            id: league.id,
            title: league.label,
          }))}
        />
      </div>
    </div>
  );
}
