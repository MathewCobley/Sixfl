// ========================================
// File: src/components/admin/communications/CommunicationsLeagueLauncher.tsx
// ========================================

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type LeagueOption = {
  id: string;
  label: string;
};

export default function CommunicationsLeagueLauncher({ leagues }: { leagues: LeagueOption[] }) {
  const [query, setQuery] = useState("");

  const filteredLeagues = useMemo(() => {
    const value = query.trim().toLowerCase();

    if (!value) {
      return leagues.slice(0, 8);
    }

    return leagues
      .filter((league) => league.label.toLowerCase().includes(value))
      .slice(0, 12);
  }, [leagues, query]);

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
          League communications
        </div>
        <h2 className="text-2xl font-semibold text-white">Open a whole-league broadcast page</h2>
        <p className="max-w-2xl text-sm text-white/60">
          Search for a league and queue one message across all teams in that league, with the history still written into each team record.
        </p>
      </div>

      <div className="mt-5 max-w-3xl space-y-4">
        <div>
          <label className="mb-2 block text-sm text-white/70">League</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search league"
            className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/60"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20">
          {filteredLeagues.length === 0 ? (
            <div className="px-4 py-4 text-sm text-white/55">No matching leagues.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {filteredLeagues.map((league) => (
                <div
                  key={league.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-sm font-semibold text-white">{league.label}</div>

                  <Link
                    href={`/admin/leagues/${league.id}/communications`}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    Open league
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
