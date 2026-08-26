import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamReferralPayoutDetails, formatSortCode } from "@/lib/team-referral-payout";
import { getTeamReferrals, referralStatus } from "@/lib/team-referrals";
import { markReferralPaidAction } from "../../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Referral payout | SIXFL Admin" };

type Params = Promise<{ id: string }>;

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function AdminReferralPayoutPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const referrals = await getTeamReferrals();
  const referral = referrals.find((item) => item.id === id);
  if (!referral) notFound();

  const status = referralStatus(referral);
  const payout = await getTeamReferralPayoutDetails(referral.id);
  const teamLabel = referral.teamName ?? referral.leadTeamName ?? "Referred team";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Referral payout</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{referral.referrerName ?? referral.referrerEmail ?? "Player"}</h1>
          <p className="mt-2 text-sm text-slate-600">{teamLabel} · {money(referral.rewardPence)}</p>
        </div>
        <Link href="/admin/referrals" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
          Back to referrals
        </Link>
      </div>

      {status === "PAID" ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-xl font-black text-emerald-950">Paid</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-800">
            This referral reward has been marked as paid. The stored account number and sort code were removed when payment was recorded.
          </p>
        </section>
      ) : status !== "READY" ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-black text-amber-950">Not yet payable</h2>
          <p className="mt-2 text-sm text-amber-800">The referred team has completed {referral.completedMatches} of {referral.requiredMatches} qualifying matches.</p>
        </section>
      ) : !payout?.details ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-black text-amber-950">Awaiting payment details</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            The reward is ready, but the player has not yet submitted bank details through the secure SIXFL payout page.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Payment details received</p>
                <h2 className="mt-2 text-xl font-black text-slate-950">UK bank transfer</h2>
              </div>
              {payout.submittedAt ? <span className="text-xs font-bold text-slate-500">Submitted {dateTime(payout.submittedAt)}</span> : null}
            </div>

            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Account holder</dt>
                <dd className="mt-2 font-black text-slate-950">{payout.details.accountHolderName}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Sort code</dt>
                <dd className="mt-2 font-mono text-lg font-black text-slate-950">{formatSortCode(payout.details.sortCode)}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Account number</dt>
                <dd className="mt-2 font-mono text-lg font-black text-slate-950">{payout.details.accountNumber}</dd>
              </div>
            </dl>

            <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
              Pay {money(referral.rewardPence)} to the account above, then mark the reward paid. Marking it paid removes the stored sort code and account number from SIXFL.
            </div>

            <form action={markReferralPaidAction} className="mt-5">
              <input type="hidden" name="referralId" value={referral.id} />
              <button className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-500">
                Mark {money(referral.rewardPence)} paid
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
