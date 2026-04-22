// ========================================
// File: src/components/admin/communications/CommunicationsProspectLauncher.tsx
// ========================================

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import CompactLauncherPicker from "@/components/admin/communications/CompactLauncherPicker";

type ProspectOption = {
  id: string;
  teamId: string;
  label: string;
};

export default function CommunicationsProspectLauncher({ prospects }: { prospects: ProspectOption[] }) {
  const [selectedProspectId, setSelectedProspectId] = useState("");

  const selectedProspect = useMemo(
    () => prospects.find((prospect) => prospect.id === selectedProspectId) ?? null,
    [prospects, selectedProspectId],
  );

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            Prospect communications
          </div>
          <h2 className="text-2xl font-semibold text-white">Open a prospect outreach hub</h2>
          <p className="max-w-2xl text-sm text-white/60">
            Pick a prospect and jump straight into that team’s prospect hub with bulk email, bulk SMS, recipient selection, and the wider prospect pipeline already in place.
          </p>
        </div>

        {selectedProspect ? (
          <Link
            href={`/admin/teams/${selectedProspect.teamId}/prospects`}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Open prospect hub
          </Link>
        ) : null}
      </div>

      <div className="mt-5 max-w-3xl">
        <CompactLauncherPicker
          label="Prospect"
          placeholder="Select a prospect"
          selectedId={selectedProspectId}
          onSelect={setSelectedProspectId}
          options={prospects.map((prospect) => ({
            id: prospect.id,
            title: prospect.label,
          }))}
        />
      </div>
    </div>
  );
}
