// ========================================
// File: src/components/admin/leagues/AdminLeagueTableSelector.tsx
// ========================================

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import FormListboxField, {
  type FormListboxOption,
} from "@/components/ui/FormListboxField";

export default function AdminLeagueTableSelector({
  leagues,
  selectedLeagueId,
}: {
  leagues: FormListboxOption[];
  selectedLeagueId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function selectLeague(leagueId: string) {
    if (!leagueId || leagueId === selectedLeagueId) return;

    startTransition(() => {
      router.push(`/admin/league-tables?leagueId=${encodeURIComponent(leagueId)}`);
    });
  }

  return (
    <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,520px)] lg:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
            Choose competition
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Select a league table</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            Pick any current or previous SIXFL league. The standings below update immediately.
          </p>
        </div>

        <div className={pending ? "pointer-events-none opacity-60" : ""}>
          <FormListboxField
            name="leagueId"
            label="League"
            value={selectedLeagueId}
            options={leagues}
            placeholder="Select a league"
            disabled={leagues.length === 0 || pending}
            onValueChange={selectLeague}
          />
          {pending ? (
            <div className="mt-2 text-xs font-medium text-emerald-200">Loading table…</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
