// ========================================
// File: src/components/admin/communications/CommunicationsAllTeamsLauncher.tsx
// ========================================

import Link from "next/link";

export default function CommunicationsAllTeamsLauncher({
  teamCount,
  emailReadyCount,
}: {
  teamCount: number;
  emailReadyCount: number;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            All-team email
          </div>
          <h2 className="text-2xl font-semibold text-white">Email teams with a picker</h2>
          <p className="max-w-2xl text-sm text-white/60">
            Send an email to any mix of teams, including teams that are not currently in a league. Choose exactly who receives it before queueing.
          </p>
        </div>

        <Link
          href="/admin/messaging/teams"
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Open team picker
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
          {teamCount} teams
        </span>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
          {emailReadyCount} email ready
        </span>
      </div>
    </div>
  );
}
