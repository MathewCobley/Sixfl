import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { getOriginalChargeCorrectionCandidate, PlayerChargeCorrectionError } from "@/lib/payments/player-charge-correction";
import CorrectOriginalPlayerChargeForm from "@/components/payments/CorrectOriginalPlayerChargeForm";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ feeId: string }> }) {
  const access = await requireAdmin();
  if (!access.user || access.user.role !== "ADMIN") redirect("/dashboard");
  const { feeId } = await params;
  let candidate;
  try { candidate = await getOriginalChargeCorrectionCandidate(feeId, access.user.id); }
  catch (error) {
    if (!(error instanceof PlayerChargeCorrectionError)) throw error;
    return <main className="mx-auto max-w-3xl space-y-5 p-6 text-white"><h1 className="text-2xl font-semibold">Correct original charge · Admin only</h1>
      <p role="alert" className="rounded-2xl border border-amber-400/30 p-5">{error.message}</p><Link href="/admin/payments" className="text-emerald-200 underline">Back to payments</Link></main>;
  }
  return <main className="mx-auto max-w-3xl space-y-6 p-6 text-white">
    <Link href={`/captain/team/${candidate.teamId}/payments`} className="text-emerald-200 underline">Back to team payments</Link>
    <header><p className="text-sm uppercase text-amber-200">Admin only · Historical correction</p><h1 className="mt-2 text-3xl font-semibold">Correct original charge</h1>
      <p className="mt-3 font-semibold">{candidate.playerName} · {candidate.teamName}</p><p className="text-sm text-white/65">{candidate.fixtureLabel} · {formatDateTimeInLondon(new Date(candidate.kickoffAt), { day: "numeric", month: "short", year: "numeric" })}</p></header>
    <p className="rounded-xl border border-amber-400/25 p-4 text-sm">Use this only to reconcile an old paid player row where the recorded payment is real but the original assigned share was larger. You can either restore the difference as unpaid, or record it as a genuine SIXFL adjustment so the player remains settled. Existing Stripe receipts are verified before preview and again before saving; no new payment, refund or message is created.</p>
    <CorrectOriginalPlayerChargeForm feeId={feeId} teamId={candidate.teamId} assignedPence={candidate.assignedPence} receivedPence={candidate.receivedPence}/>
  </main>;
}
