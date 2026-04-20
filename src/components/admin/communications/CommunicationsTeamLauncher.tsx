// ========================================
// File: src/components/admin/communications/CommunicationsTeamLauncher.tsx
// ========================================

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type TeamOption = {
  id: string;
  name: string;
  leagueLabel: string | null;
};

export default function CommunicationsTeamLauncher({
  teams,
}: {
  teams: TeamOption[];
}) {
  const [query, setQuery] = useState("");

  const filteredTeams = useMemo(() => {
    const value = query.trim().toLowerCase();

    if (!value) {
      return teams.slice(0, 8);
    }

    return teams
      .filter((team) => {
        const haystack = `${team.name} ${team.leagueLabel ?? ""}`.toLowerCase();
        return haystack.includes(value);
      })
      .slice(0, 12);
  }, [query, teams]);

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
          Outbound communications
        </div>
        <h2 className="text-2xl font-semibold text-white">Open a team communications hub</h2>
        <p className="max-w-2xl text-sm text-white/60">
          Search for a team and jump straight into its communications page to send email or SMS with templates, history, and thread tracking already in place.
        </p>
      </div>

      <div className="mt-5 max-w-3xl space-y-4">
        <div>
          <label className="mb-2 block text-sm text-white/70">Team</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search team or league"
            className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/60"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20">
          {filteredTeams.length === 0 ? (
            <div className="px-4 py-4 text-sm text-white/55">No matching teams.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {filteredTeams.map((team) => (
                <div
                  key={team.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{team.name}</div>
                    <div className="mt-1 text-xs text-white/45">{team.leagueLabel || "No league assigned"}</div>
                  </div>

                  <Link
                    href={`/admin/teams/${team.id}/communications`}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    Open communications
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
