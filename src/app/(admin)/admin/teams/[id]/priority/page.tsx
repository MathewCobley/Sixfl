import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import FormListboxField from "@/components/ui/FormListboxField";
import PriorityDeductions from "@/components/sixfl-tv/PriorityDeductions";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { getPriorityDeductionDetails } from "@/lib/sixfl-tv/priority-deductions";
import { getSixflTvPriorityScore } from "@/lib/sixfl-tv/priority-score";
import { reviewPriorityAction } from "./actions";

export const dynamic = "force-dynamic";
const panel = "space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5";
const button = "min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10";
function date(value: Date) { return formatDateTimeInLondon(value, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
function ReviewForm({ teamId, referenceId, kind, label }: { teamId: string; referenceId: string; kind: string; label: string }) {
  return <form action={reviewPriorityAction} className="mt-3 flex flex-wrap items-end gap-3">
    <input type="hidden" name="teamId" value={teamId} /><input type="hidden" name="referenceId" value={referenceId} /><input type="hidden" name="kind" value={kind} />
    <label className="grow text-xs">Reason<input name="reason" required maxLength={1000} className="mt-1 block min-h-11 w-full rounded-xl border border-white/20 bg-black/30 px-3 text-sm" /></label>
    <button className={button}>{label}</button>
  </form>;
}
export default async function PriorityReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id }, select: { name: true } });
  if (!team) notFound();
  const [allDetails, score, fixtures] = await Promise.all([
    getPriorityDeductionDetails([id]), getSixflTvPriorityScore(id),
    prisma.$queryRaw<Array<{ id: string; kickoffAt: Date; label: string }>>(Prisma.sql`SELECT f.id,f."kickoffAt",h.name || ' v ' || a.name AS label FROM "Fixture" f JOIN "Team" h ON h.id=f."homeTeamId" JOIN "Team" a ON a.id=f."awayTeamId" WHERE ${id} IN (f."homeTeamId",f."awayTeamId") AND f."kickoffAt" <= NOW() AND f."kickoffAt" > NOW() - INTERVAL '28 days' ORDER BY f."kickoffAt" DESC`),
  ]);
  const details = allDetails.get(id)!;
  return <div className="mx-auto max-w-5xl space-y-5 text-white">
    <Link href={`/admin/teams/${id}`} className="text-sm text-emerald-200 underline">{team.name}</Link>
    <h1 className="text-2xl font-bold">Priority review · {score.score}/100</h1>
    <PriorityDeductions deductions={details.deductions} deductionPoints={details.deductionPoints} />
    <section className={panel}><h2 className="text-lg font-semibold">Overdue payments</h2><p className="text-sm text-white/60">A hold excludes a disputed charge from Priority deductions only. It does not change the debt, payment collection or the historical match payment points.</p>
      {!details.overdueCharges.length ? <p>No outstanding charges more than 14 days overdue.</p> : details.overdueCharges.map(row => <div key={row.id} className="border-t border-white/10 pt-3"><p>{row.title} · £{(row.outstandingPence / 100).toFixed(2)} · due {date(row.dueDate)}{row.held ? " · Under review" : ""}</p>{!row.held ? <ReviewForm teamId={row.teamId} referenceId={row.id} kind="PAYMENT_HOLD" label="Exclude disputed charge" /> : null}</div>)}
    </section>
    <section className={panel}><h2 className="text-lg font-semibold">Shin-pad warnings · last 28 days</h2><p className="text-sm text-white/60">One warning per team per fixture. Excluding an incorrect warning restores its Priority points but preserves the original referee record and warning history.</p>
      {!details.warnings.length ? <p>No recent warnings.</p> : details.warnings.map(row => <div key={row.id} className="border-t border-white/10 pt-3"><p>{row.label} · recorded {date(row.at)}</p>{details.reviews.some(review => review.kind === "SHIN_PAD_DISMISSED" && review.referenceId === row.id && !review.revokedAt) ? <p>Excluded from Priority Score.</p> : <ReviewForm teamId={row.teamId} referenceId={row.id} kind="SHIN_PAD_DISMISSED" label="Exclude incorrect warning" />}</div>)}
    </section>
    <section className={panel}><h2 className="text-lg font-semibold">Confirm a sending-off</h2><p className="text-sm text-white/60">Only confirm after SIXFL review. Apply once per team per fixture, using the most serious confirmed sending-off. Points return 28 days after the match. Saving again replaces that fixture’s decision rather than adding a duplicate.</p>
      <form action={reviewPriorityAction} className="space-y-4"><input type="hidden" name="teamId" value={id} /><input type="hidden" name="kind" value="RED_CARD" />
        <FormListboxField name="referenceId" label="Fixture" options={fixtures.map(row => ({ value: row.id, label: `${date(row.kickoffAt)} · ${row.label}` }))} />
        <fieldset className="space-y-2"><legend>Confirmed severity</legend><label className="flex min-h-11 items-center gap-2"><input type="radio" name="points" value="10" required />Sending-off: −10</label><label className="flex min-h-11 items-center gap-2"><input type="radio" name="points" value="20" required />Serious misconduct: −20</label></fieldset>
        <label className="block">Decision and reason<textarea name="reason" required maxLength={1000} className="mt-1 block min-h-24 w-full rounded-xl border border-white/20 bg-black/30 p-3" /></label>
        <label className="flex min-h-11 items-center gap-2"><input name="confirmed" type="checkbox" required />SIXFL has reviewed and confirmed this sending-off.</label>
        <button className={button} disabled={!fixtures.length}>Save confirmed decision</button>
      </form>
    </section>
    <section className={panel}><h2 className="text-lg font-semibold">Review history</h2>{!details.reviews.length ? <p>No decisions recorded.</p> : details.reviews.map(row => <div key={row.id} className="border-t border-white/10 pt-3"><p className="font-semibold">{row.kind === "RED_CARD" ? `Sending-off: −${row.points}` : row.kind === "PAYMENT_HOLD" ? "Disputed charge excluded" : "Shin-pad warning excluded"} · {row.revokedAt ? "Reversed" : "Recorded"}</p><p className="whitespace-pre-wrap text-sm text-white/70">{row.reason}</p><p className="text-xs text-white/50">{date(row.createdAt)} · {row.createdBy}</p>{!row.revokedAt ? <ReviewForm teamId={row.teamId} referenceId={row.id} kind="REVOKE" label="Reverse this decision" /> : null}</div>)}</section>
  </div>;
}
