import Link from "next/link";
import { redirect } from "next/navigation";

import CorrectCaptainAssignedShareForm from "@/components/payments/CorrectCaptainAssignedShareForm";
import CorrectOriginalPlayerChargeForm from "@/components/payments/CorrectOriginalPlayerChargeForm";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  getCaptainAssignedShareCorrectionCandidate,
  PlayerAssignedShareCorrectionError,
} from "@/lib/payments/player-assigned-share-correction";
import {
  getOriginalChargeCorrectionCandidate,
  PlayerChargeCorrectionError,
} from "@/lib/payments/player-charge-correction";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ feeId: string }>;
}) {
  const access = await requireAdmin();
  if (!access.user || access.user.role !== "ADMIN") redirect("/dashboard");

  const { feeId } = await params;

  try {
    const shareCandidate = await getCaptainAssignedShareCorrectionCandidate(
      feeId,
      access.user.id,
    );

    if (shareCandidate) {
      return (
        <main className="mx-auto max-w-3xl space-y-6 p-6 text-white">
          <Link
            href={`/captain/team/${shareCandidate.teamId}/payments`}
            className="text-emerald-200 underline"
          >
            Back to team payments
          </Link>

          <header>
            <p className="text-sm uppercase text-amber-200">
              Admin only · Capped/overridden player
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              Correct captain-assigned share
            </h1>
            <p className="mt-3 font-semibold">
              {shareCandidate.playerName} · {shareCandidate.teamName}
            </p>
            <p className="text-sm text-white/65">
              {shareCandidate.fixtureLabel} ·{" "}
              {formatDateTimeInLondon(new Date(shareCandidate.kickoffAt), {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </header>

          <div className="space-y-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.05] p-4 text-sm leading-6">
            <p className="font-semibold text-amber-100">
              This player has a fee cap or override, so the historical-debt correction is deliberately disabled.
            </p>
            <p className="text-white/75">
              A cap is a genuine SIXFL concession. Turning the difference into player debt would be wrong. Use this control only to restore what the captain originally assigned — for example £8 assigned while the player was correctly charged £5.
            </p>
            <p className="text-white/65">
              Saving here changes the captain-assigned share only. It does not change the player&apos;s charge, cap, payment status, receipts or outstanding balance.
            </p>
          </div>

          <CorrectCaptainAssignedShareForm
            feeId={feeId}
            teamId={shareCandidate.teamId}
            playerChargePence={shareCandidate.playerChargePence}
            currentAssignedPence={shareCandidate.currentAssignedPence}
            suggestedAssignedPence={shareCandidate.suggestedAssignedPence}
            capPence={shareCandidate.capPence}
            overridePence={shareCandidate.overridePence}
            hasFeeCapEvidence={shareCandidate.hasFeeCapEvidence}
          />
        </main>
      );
    }
  } catch (error) {
    if (!(error instanceof PlayerAssignedShareCorrectionError)) throw error;
    return (
      <main className="mx-auto max-w-3xl space-y-5 p-6 text-white">
        <h1 className="text-2xl font-semibold">Correct captain share · Admin only</h1>
        <p role="alert" className="rounded-2xl border border-amber-400/30 p-5">
          {error.message}
        </p>
        <Link href="/admin/payments" className="text-emerald-200 underline">
          Back to payments
        </Link>
      </main>
    );
  }

  let candidate;
  try {
    candidate = await getOriginalChargeCorrectionCandidate(feeId, access.user.id);
  } catch (error) {
    if (!(error instanceof PlayerChargeCorrectionError)) throw error;
    return (
      <main className="mx-auto max-w-3xl space-y-5 p-6 text-white">
        <h1 className="text-2xl font-semibold">Correct original charge · Admin only</h1>
        <p role="alert" className="rounded-2xl border border-amber-400/30 p-5">
          {error.message}
        </p>
        <Link href="/admin/payments" className="text-emerald-200 underline">
          Back to payments
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 text-white">
      <Link
        href={`/captain/team/${candidate.teamId}/payments`}
        className="text-emerald-200 underline"
      >
        Back to team payments
      </Link>
      <header>
        <p className="text-sm uppercase text-amber-200">
          Admin only · Historical correction
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Correct original charge</h1>
        <p className="mt-3 font-semibold">
          {candidate.playerName} · {candidate.teamName}
        </p>
        <p className="text-sm text-white/65">
          {candidate.fixtureLabel} ·{" "}
          {formatDateTimeInLondon(new Date(candidate.kickoffAt), {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </header>
      <p className="rounded-xl border border-amber-400/25 p-4 text-sm">
        This restores a historical unpaid remainder. It does not create another charge or payment, and must not be used to reverse a genuine discount or waiver. Existing receipts are verified with Stripe before preview and again before saving.
      </p>
      <CorrectOriginalPlayerChargeForm
        feeId={feeId}
        teamId={candidate.teamId}
        assignedPence={candidate.assignedPence}
        receivedPence={candidate.receivedPence}
      />
    </main>
  );
}
