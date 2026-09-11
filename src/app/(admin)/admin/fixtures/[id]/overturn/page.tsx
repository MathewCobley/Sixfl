import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getResultOverturnPage, ResultOverturnError } from "@/lib/results/overturn-result";
import { OVERTURN_REASONS } from "@/lib/results/result-scores";
import OverturnResultForm from "@/components/results/OverturnResultForm";
import ResultOverturnNotice from "@/components/results/ResultOverturnNotice";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireAdmin();
  if (!access.user || access.user.role !== "ADMIN") redirect("/dashboard");
  const { id } = await params;
  let data;
  try { data = await getResultOverturnPage(id, access.user.id); }
  catch (error) {
    if (!(error instanceof ResultOverturnError)) throw error;
    return <main className="mx-auto max-w-3xl space-y-5 p-6 text-white"><h1 className="text-2xl font-semibold">Overturn result</h1><p role="alert" className="rounded-xl border border-amber-300/30 p-4">{error.message}</p><Link className="text-emerald-200 underline" href={`/admin/fixtures/${id}/result`}>Back to result</Link></main>;
  }
  const { fixture, decision } = data;
  return <main className="mx-auto max-w-3xl space-y-6 p-6 text-white">
    <Link className="text-emerald-200 underline" href={`/admin/fixtures/${id}/result`}>Back to result</Link>
    <header><p className="text-xs uppercase tracking-widest text-amber-200">Admin only · Competition decision</p><h1 className="mt-2 text-3xl font-semibold">{decision ? "Overturned result — decision record" : "Overturn result"}</h1><p className="mt-3 font-semibold">{fixture.homeTeam.name} vs {fixture.awayTeam.name}</p><p className="mt-1 text-sm text-white/60">{fixture.league.name} · {formatDateTimeInLondon(fixture.kickoffAt, { day: "numeric", month: "long", year: "numeric" })}</p></header>
    {decision ? <section className="space-y-4 rounded-2xl border border-white/15 p-5">
      <p className="text-lg font-semibold">Official result: {fixture.homeTeam.name} {fixture.result.homeScore}–{fixture.result.awayScore} {fixture.awayTeam.name}</p>
      <ResultOverturnNotice result={fixture.result} homeName={fixture.homeTeam.name} awayName={fixture.awayTeam.name}/>
      <p className="text-sm text-white/70">Recorded {formatDateTimeInLondon(decision.decidedAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · Administrator ID: {decision.decidedByUserId}</p>
      <h2 className="font-semibold">Private review record</h2>
      <dl className="space-y-4 text-sm"><div><dt className="text-white/60">Category</dt><dd>{OVERTURN_REASONS.find(r => r.value === decision.reasonCode)?.label ?? "Competition decision"}</dd></div>{[["Decision reason", decision.decisionReason],["Evidence reference", decision.evidenceReference],["Applicable rules", decision.rulesBasis]].map(([label,value]) => <div key={label}><dt className="text-white/60">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>
      <p className="text-sm text-white/60">The original score and this decision are retained. Ordinary result editing is disabled. Notify both captains separately; any related dispute can be resolved separately in Admin Results.</p>
    </section> : <OverturnResultForm fixtureId={id} home={{ id: fixture.homeTeamId, name: fixture.homeTeam.name }} away={{ id: fixture.awayTeamId, name: fixture.awayTeam.name }} original={{ homeScore: fixture.result.homeScore, awayScore: fixture.result.awayScore }}/>}
  </main>;
}
