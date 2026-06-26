// ========================================
// File: src/components/admin/communications/CommunicationsTeamLauncher.tsx
// ========================================

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import CompactLauncherPicker from "@/components/admin/communications/CompactLauncherPicker";

type TeamOption = {
  id: string;
  name: string;
  leagueLabel: string | null;
};

export default function CommunicationsTeamLauncher({ teams }: { teams: TeamOption[] }) {
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            Outbound communications
          </div>
          <h2 className="text-2xl font-semibold text-white">Start a team message</h2>
          <p className="max-w-2xl text-sm text-white/60">
            Pick one team for a direct message, or open the all-team picker to email or SMS any mix of teams, including teams that are not in a current league.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/messaging/teams"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Email / SMS selected teams
          </Link>

          {selectedTeam ? (
            <Link
              href={`/admin/messages?composeTeam=${encodeURIComponent(selectedTeam.id)}`}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Open {selectedTeam.name}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-5 max-w-3xl">
        <CompactLauncherPicker
          label="Team"
          placeholder="Select a team"
          selectedId={selectedTeamId}
          onSelect={setSelectedTeamId}
          options={teams.map((team) => ({
            id: team.id,
            title: team.name,
            subtitle: team.leagueLabel || "No league assigned",
          }))}
        />
      </div>
    </div>
  );
}
