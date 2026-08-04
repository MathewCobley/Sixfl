import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamReferrals, referralStatus } from "@/lib/team-referrals";
import { markReferralPaidAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Team Referrals | SIXFL Admin" };

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function date(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(value);
}

export default async function AdminReferralsPage() {
  await requireAdmin();
  const referrals = await getTeamReferrals();
  const readyCount = referrals.filter((row) => referralStatus(row) === "READY").length;
  const unpaidValue = referrals
    .filter((row) => referralStatus(row) === "READY")
    .reduce((total, row) => total + row.rewardPence, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Growth</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Team referral rewards</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Players earn £75 after a team they refer has completed three league matches.
          </p>
        </div>
        <Link href="/admin/leads?type=TEAM" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
          View team leads
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Total referrals" value={String(referrals.length)} />
        <Summary label="Ready to pay" value={String(readyCount)} />
        <Summary label="Amount due" value={money(unpaidValue)} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {referrals.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No team referrals have been recorded yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {referrals.map((row) => {
              const status = referralStatus(row);
              const displayedTeam = row.teamName ?? row.leadTeamName ?? "Unnamed team";
              return (
                <div key={row.id} className="grid gap-4 p-5 lg:grid-cols-[1.2fr_1.2fr_0.8fr_auto] lg:items-center">
                  <div>
                    <p className="font-black text-slate-950">{row.referrerName ?? row.referrerEmail ?? "Player"}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.referrerEmail ?? "No email"}</p>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{displayedTeam}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.leagueName ?? "Not assigned to a league yet"} · referred {date(row.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{Math.min(row.completedMatches, row.requiredMatches)} of {row.requiredMatches} matches</p>
                    <p className="mt-1 text-xs text-slate-500">Reward: {money(row.rewardPence)}</p>
                  </div>
                  <div className="min-w-36 text-left lg:text-right">
                    {status === "PAID" ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">Paid</span>
                    ) : status === "READY" ? (
                      <form action={markReferralPaidAction}>
                        <input type="hidden" name="referralId" value={row.id} />
                        <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-500">
                          Mark £75 paid
                        </button>
                      </form>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">In progress</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}
