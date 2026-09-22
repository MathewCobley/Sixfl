import Link from "next/link";
import { getMatchReportWarnings } from "@/lib/match-reports/review";
import { requireAdmin } from "@/lib/requireAdmin";
import { formatDateTimeInLondon } from "@/lib/datetime/london";

export default async function MatchReportWarnings({ fixtureId, fixtureIds }: { fixtureId?: string; fixtureIds?: string[] }) {
  await requireAdmin();
  const warnings = await getMatchReportWarnings(fixtureId, fixtureIds);
  if (!warnings.length) return null;
  return <section className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-5">
    <h2 className="text-lg font-semibold text-amber-100">Match reports need review ({warnings.length})</h2>
    <p className="mt-2 text-sm text-amber-100/80">Reported player goals plus own goals, or assists, exceed the recorded on-pitch score. Reports have been preserved for correction.</p>
    <ul className="mt-4 space-y-4">{warnings.map(warning => <li key={`${warning.fixtureId}-${warning.teamId}`} className="text-sm text-white/85">
      <p className="font-semibold">{warning.homeName} vs {warning.awayName} · {formatDateTimeInLondon(warning.kickoffAt, { day: "numeric", month: "short", year: "numeric" })}</p>
      <p>{warning.teamName}: {warning.goalsRecorded} player goals + {warning.ownGoals} own goal{warning.ownGoals === 1 ? "" : "s"}, {warning.assistsRecorded} assists; on-pitch score {warning.goalsExpected}.</p>
      <div className="mt-2 flex flex-wrap gap-4"><Link className="text-emerald-200 underline" href={`/captain/team/${warning.teamId}/results#match-${warning.resultId}`}>Review team report</Link><Link className="text-emerald-200 underline" href={`/admin/fixtures/${warning.fixtureId}/result`}>Review result</Link></div>
    </li>)}</ul>
  </section>;
}
