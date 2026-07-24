// ========================================
// File: src/components/admin/teams/TeamShinPadWarningPanel.tsx
// ========================================

import Link from "next/link";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getTeamShinPadWarningRecords } from "@/lib/fixtures/shin-pad-warning-records";

function formatWarningDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TeamShinPadWarningPanel({
  teamId,
}: {
  teamId: string;
}) {
  const warnings = await getTeamShinPadWarningRecords(teamId);
  const count = warnings.length;

  if (count === 0) return null;

  const latest = warnings[0];
  const actionRequired = count >= 3;
  const repeated = count >= 2;
  const panelTone = actionRequired
    ? "border-red-400/35 bg-red-500/12 shadow-[0_16px_60px_rgba(239,68,68,0.12)]"
    : repeated
      ? "border-amber-300/35 bg-amber-400/12 shadow-[0_16px_60px_rgba(245,158,11,0.1)]"
      : "border-amber-400/20 bg-amber-500/8";
  const eyebrowTone = actionRequired
    ? "text-red-200"
    : "text-amber-100/80";

  return (
    <section className={`rounded-3xl border px-5 py-5 ${panelTone}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${eyebrowTone}`}
          >
            {actionRequired
              ? "Admin action required"
              : repeated
                ? "Repeated safety warning"
                : "Team safety record"}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {count} shin pad warning{count === 1 ? "" : "s"} recorded
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
            {actionRequired
              ? "This team has now received three or more shin pad warnings. Admin should contact the team and confirm every player will wear shin pads before the next fixture."
              : repeated
                ? "This is no longer an isolated incident. Review the warning history and consider contacting the team directly."
                : "One shin pad warning is recorded. Further warnings will make this alert more prominent."}
          </p>
          <p className="mt-3 text-xs text-white/45">
            Latest: {latest.homeTeamName} v {latest.awayTeamName} · {formatWarningDate(latest.kickoffAt)}
          </p>
        </div>

        <Link
          href={`/admin/teams/${teamId}/shin-pad-warnings`}
          className={[
            "inline-flex h-11 shrink-0 items-center justify-center rounded-xl border px-5 text-sm font-semibold transition",
            actionRequired
              ? "border-red-300/35 bg-red-400/15 text-red-50 hover:bg-red-400/20"
              : "border-amber-300/30 bg-amber-300/10 text-amber-50 hover:bg-amber-300/15",
          ].join(" ")}
        >
          Review warning history
        </Link>
      </div>
    </section>
  );
}
