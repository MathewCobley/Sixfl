import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateReferralCode, getTeamReferrals, referralStatus } from "@/lib/team-referrals";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Refer a Team | SIXFL" };

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

export default async function PlayerReferralsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/player/referrals")}`);
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: { id: true, name: true },
  });
  if (!user) redirect("/login");

  const code = await getOrCreateReferralCode(user.id);
  const referrals = await getTeamReferrals(user.id);
  const referralUrl = `https://www.sixfl.co.uk/register-interest?type=team&ref=${encodeURIComponent(code)}`;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">SIXFL rewards</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Refer a team and earn £75</h1>
          </div>
          <Link href="/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
            Back to dashboard
          </Link>
        </div>

        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6 sm:p-8">
          <h2 className="text-xl font-black">How it works</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-50/90">
            Share your personal link with a new team. Once that team joins any SIXFL league and completes three matches, your £75 reward becomes payable.
          </p>
          <Link
            href="/referral-terms"
            className="mt-3 inline-flex text-sm font-black text-emerald-100 underline decoration-emerald-300/50 underline-offset-4 hover:text-white"
          >
            Read the referral terms and conditions
          </Link>
          <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className="text-xs font-black uppercase tracking-[0.14em] text-emerald-200">Your referral code</label>
              <div className="mt-2 rounded-2xl border border-white/15 bg-black/20 px-5 py-4 font-mono text-xl font-black tracking-widest">{code}</div>
            </div>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Join a SIXFL league using my referral link: ${referralUrl}`)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-black text-slate-950 hover:bg-emerald-300"
            >
              Share on WhatsApp
            </a>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/80 break-all">{referralUrl}</div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 sm:p-8">
          <h2 className="text-xl font-black">Your referrals</h2>
          {referrals.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-white/60">You have not referred a team yet. Share your link and their registration will appear here automatically.</p>
          ) : (
            <div className="mt-5 space-y-4">
              {referrals.map((row) => {
                const status = referralStatus(row);
                const progress = Math.min(row.completedMatches, row.requiredMatches);
                return (
                  <div key={row.id} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{row.teamName ?? row.leadTeamName ?? "Referred team"}</p>
                        <p className="mt-1 text-xs text-white/50">{row.leagueName ?? "Waiting to join a league"}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${status === "PAID" ? "bg-emerald-400 text-slate-950" : status === "READY" ? "bg-sky-300 text-slate-950" : "bg-amber-300 text-slate-950"}`}>
                        {status === "PAID" ? "£75 paid" : status === "READY" ? "£75 ready" : `${progress} of ${row.requiredMatches} matches`}
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(progress / row.requiredMatches) * 100}%` }} />
                    </div>
                    <p className="mt-3 text-sm text-white/70">
                      {status === "PAID"
                        ? `Your ${money(row.rewardPence)} reward has been marked as paid.`
                        : status === "READY"
                          ? row.payoutDetailsSubmittedAt
                            ? `Your payment details have been received. SIXFL can now arrange your ${money(row.rewardPence)} reward.`
                            : `The team has completed three matches. Your ${money(row.rewardPence)} reward is now due.`
                          : `${row.requiredMatches - progress} more completed ${row.requiredMatches - progress === 1 ? "match" : "matches"} until your ${money(row.rewardPence)} reward.`}
                    </p>
                    {status === "READY" ? (
                      <Link
                        href={`/player/referrals/payout/${encodeURIComponent(row.id)}`}
                        className="mt-4 inline-flex rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-300"
                      >
                        {row.payoutDetailsSubmittedAt ? "Review payment details" : "Provide payment details"}
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="text-xs leading-5 text-white/40">
          The team must be new to SIXFL and use your referral code when registering. Cancelled or postponed fixtures do not count. <Link href="/referral-terms" className="font-bold text-white/65 underline underline-offset-4 hover:text-white">Terms and conditions apply.</Link>
        </p>
      </div>
    </main>
  );
}
