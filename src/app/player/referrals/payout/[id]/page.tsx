import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTeamReferralPayoutDetails, maskAccountNumber, formatSortCode } from "@/lib/team-referral-payout";
import { getTeamReferrals, referralStatus } from "@/lib/team-referrals";
import { saveReferralPayoutDetailsAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Referral payment details | SIXFL" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ saved?: string; error?: string }>;

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

export default async function ReferralPayoutPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: SearchParams;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const callback = `/player/referrals/payout/${encodeURIComponent(id)}`;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: { id: true },
  });
  if (!user) redirect("/login");

  const referrals = await getTeamReferrals(user.id);
  const referral = referrals.find((item) => item.id === id);
  if (!referral) notFound();

  const status = referralStatus(referral);
  const payout = await getTeamReferralPayoutDetails(referral.id);
  const teamLabel = referral.teamName ?? referral.leadTeamName ?? "your referred team";
  const hasStoredDetails = Boolean(payout?.details);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">SIXFL reward</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Payment details</h1>
            <p className="mt-3 text-sm leading-6 text-white/65">
              {teamLabel} · {money(referral.rewardPence)} referral reward
            </p>
          </div>
          <Link href="/player/referrals" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
            Back to referrals
          </Link>
        </div>

        {sp.saved === "1" ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 text-sm font-bold text-emerald-100">
            Payment details saved securely. SIXFL can now arrange your reward payment.
          </div>
        ) : null}

        {sp.error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-100">
            {sp.error}
          </div>
        ) : null}

        {status === "PAID" ? (
          <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6 sm:p-8">
            <h2 className="text-xl font-black">Reward paid</h2>
            <p className="mt-3 text-sm leading-7 text-emerald-50/90">
              Your {money(referral.rewardPence)} referral reward has been marked as paid. Stored bank account numbers and sort codes are removed once the reward is marked paid.
            </p>
          </section>
        ) : status !== "READY" ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 sm:p-8">
            <h2 className="text-xl font-black">Not ready yet</h2>
            <p className="mt-3 text-sm leading-7 text-white/65">
              This reward becomes payable after the referred team completes {referral.requiredMatches} qualifying league matches.
            </p>
          </section>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 sm:p-8">
            <h2 className="text-xl font-black">Bank transfer details</h2>
            <p className="mt-3 text-sm leading-7 text-white/65">
              Enter the UK bank account you would like SIXFL to use for your {money(referral.rewardPence)} reward. These details are encrypted before they are stored. Please do not send bank details by email, SMS or WhatsApp.
            </p>

            {payout?.details ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-50">
                <p className="font-black">Payment details already received</p>
                <p className="mt-2 text-emerald-50/75">
                  {payout.details.accountHolderName} · {formatSortCode(payout.details.sortCode)} · {maskAccountNumber(payout.details.accountNumber)}
                </p>
                <p className="mt-2 text-xs text-emerald-50/55">
                  Full sort code and account number are not sent back to your browser after they have been saved. Only complete the form again if you want to replace them.
                </p>
              </div>
            ) : null}

            <form action={saveReferralPayoutDetailsAction} className="mt-6 space-y-5">
              <input type="hidden" name="referralId" value={referral.id} />
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-white/60">Account holder name</span>
                <input
                  name="accountHolderName"
                  required
                  maxLength={120}
                  autoComplete="name"
                  defaultValue={payout?.details?.accountHolderName ?? ""}
                  className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-white outline-none focus:border-emerald-400"
                />
              </label>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-white/60">Sort code</span>
                  <input
                    name="sortCode"
                    required
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={hasStoredDetails ? "Enter new sort code to replace" : "12-34-56"}
                    defaultValue=""
                    className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-white outline-none focus:border-emerald-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-white/60">Account number</span>
                  <input
                    name="accountNumber"
                    required
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={hasStoredDetails ? "Enter new account number" : "12345678"}
                    defaultValue=""
                    className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-white outline-none focus:border-emerald-400"
                  />
                </label>
              </div>

              <button className="inline-flex h-12 items-center justify-center rounded-xl bg-emerald-400 px-6 text-sm font-black text-slate-950 hover:bg-emerald-300">
                {hasStoredDetails ? "Replace payment details securely" : "Save payment details securely"}
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
