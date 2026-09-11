import type { ReportSource } from "@/lib/matchweek-reports/types";

const kickoffLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Kick-off time unavailable" : new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  }).format(date);
};

/** Always uses current source data, never the old article's source snapshot. */
export default function ReportSkippedFixtures({ source }: { source: ReportSource }) {
  const fixtures = source.skippedFixtures ?? [];
  const count = source.omittedFixtures + source.pendingFixtures;
  if (!count && !fixtures.length) return null;
  return (
    <section aria-labelledby="report-skipped-heading" className="rounded-2xl border border-amber-300/25 bg-amber-500/[0.06] p-5 sm:p-6">
      <h2 id="report-skipped-heading" className="text-lg font-bold text-amber-100">Matches not included ({count})</h2>
      <p className="mt-2 text-sm leading-6 text-white/70">
        {source.omittedFixtures} omitted · {source.pendingFixtures} awaiting completion. These are the current fixture records for this night, not the saved article. Times are UK local time.
      </p>
      {fixtures.length ? <ul className="mt-4 space-y-3">
        {fixtures.map(f => <li key={f.fixtureId} className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 basis-48">
              <h3 className="break-words text-base font-bold leading-7 text-white">{f.teamA} <span className="font-normal text-white/50">vs</span> {f.teamB}</h3>
              <p className="mt-1 text-sm text-white/65"><time dateTime={f.kickoffAt}>{kickoffLabel(f.kickoffAt)}</time> · {f.disposition === "pending" ? "Awaiting completion" : "Omitted from report"}</p>
            </div>
            <a href={`/admin/fixtures/${encodeURIComponent(f.fixtureId)}/edit`} target="_blank" rel="noopener noreferrer"
              aria-label={`Review ${f.teamA} vs ${f.teamB} (opens in a new tab)`}
              className="inline-flex min-h-11 items-center rounded-lg border border-amber-200/20 px-3 py-2 text-sm font-semibold text-amber-100 underline underline-offset-4 hover:bg-white/10">
              Review fixture ↗
            </a>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-100">
            {f.reasons.map(reason => <li key={reason.code} className="break-words">{reason.message}</li>)}
          </ul>
        </li>)}
      </ul> : <p className="mt-4 text-sm leading-6 text-amber-100">This older view has no per-match details. Use Check saved status to load the latest fixture reasons; no report generation is needed.</p>}
      <p className="mt-4 text-xs leading-6 text-white/60">Review links open in a new tab so your draft stays here. After correcting a fixture, use Check saved status to refresh this list. This list does not include matches in the article automatically.</p>
    </section>
  );
}
