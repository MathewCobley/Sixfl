// ========================================
// File: src/components/admin/communications/CommunicationsProspectLauncher.tsx
// ========================================

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ProspectOption = {
  id: string;
  teamId: string;
  label: string;
};

export default function CommunicationsProspectLauncher({ prospects }: { prospects: ProspectOption[] }) {
  const [query, setQuery] = useState("");

  const filteredProspects = useMemo(() => {
    const value = query.trim().toLowerCase();

    if (!value) {
      return prospects.slice(0, 8);
    }

    return prospects
      .filter((prospect) => prospect.label.toLowerCase().includes(value))
      .slice(0, 12);
  }, [prospects, query]);

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
          Prospect communications
        </div>
        <h2 className="text-2xl font-semibold text-white">Open a prospect communications page</h2>
        <p className="max-w-2xl text-sm text-white/60">
          Search for a prospect and jump straight into their communications page with timeline, templates, and outreach already in place.
        </p>
      </div>

      <div className="mt-5 max-w-3xl space-y-4">
        <div>
          <label className="mb-2 block text-sm text-white/70">Prospect</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search prospect, team or league"
            className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/60"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20">
          {filteredProspects.length === 0 ? (
            <div className="px-4 py-4 text-sm text-white/55">No matching prospects.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {filteredProspects.map((prospect) => (
                <div
                  key={prospect.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-sm font-semibold text-white">{prospect.label}</div>

                  <Link
                    href={`/admin/teams/${prospect.teamId}/prospects/${prospect.id}/communications`}
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
