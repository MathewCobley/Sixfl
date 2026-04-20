// ========================================
// File: src/components/admin/communications/CommunicationsTeamLauncher.tsx
// ========================================

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";

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
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const options = useMemo(
    () =>
      teams.map((team) => ({
        value: team.id,
        label: team.leagueLabel ? `${team.name} · ${team.leagueLabel}` : team.name,
      })),
    [teams],
  );

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            Outbound communications
          </div>
          <h2 className="text-2xl font-semibold text-white">Open a team communications hub</h2>
          <p className="max-w-2xl text-sm text-white/60">
            Pick a team and jump straight into its communications page to send email or SMS with templates, history, and thread tracking already in place.
          </p>
        </div>

        {selectedTeam ? (
          <Link
            href={`/admin/teams/${selectedTeam.id}/communications`}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Open {selectedTeam.name}
          </Link>
        ) : null}
      </div>

      <div className="mt-5 max-w-2xl">
        <TemplateSelect
          label="Team"
          value={selectedTeamId}
          onChange={setSelectedTeamId}
          options={options}
          placeholder="Select a team"
        />
      </div>
    </div>
  );
}
