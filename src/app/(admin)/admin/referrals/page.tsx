import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamReferrals, referralStatus } from "@/lib/team-referrals";
import { attachExistingLeadReferralAction, markReferralPaidAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Team Referrals | SIXFL Admin" };

type SearchParams = Promise<{
  added?: string;
  error?: string;
}>;

type AvailableLeadRow = {
  id: string;
  contactName: string;
  email: string;
  teamName: string | null;
  area: string | null;
  status: string;
  convertedTeamName: string | null;
};

type PlayerOptionRow = {
  id: string;
  name: string | null;
  email: string;
};

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function date(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(value);
}

function errorMessage(value?: string) {
  switch (value) {
    case "missing":
      return "Choose both the existing team lead and the player who referred them.";
    case "lead_not_found":
      return "That team lead could not be found, or it is not a team lead.";
    case "player_not_found":
      return "That referrer is not a current SIXFL player account with an email address.";
    case "already_referred":
      return "That lead is already linked to a referral and cannot be assigned twice.";
    case "same_email":
      return "A player cannot refer a team lead using the same email address as their own account.";
    case "attach_failed":
      return "SIXFL could not attach that referral. No referral record was created.";
    default:
      return null;
  }
}

export default async function AdminReferralsPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};

  const [referrals, availableLeads, playerOptions] = await Promise.all([
    getTeamReferrals(),
    prisma.$queryRaw<AvailableLeadRow[]>`
      SELECT
        lead."id",
        lead."contactName",
        lead."email",
        lead."teamName",
        lead."area",
        lead."status"::text AS "status",
        team."name" AS "convertedTeamName"
      FROM "InterestLead" lead
      LEFT JOIN "Team" team ON team."id" = lead."convertedTeamId"
      WHERE lead."interestType"::text = 'TEAM'
        AND NOT EXISTS (
          SELECT 1
          FROM "TeamReferral" referral
          WHERE referral."interestLeadId" = lead."id"
        )
      ORDER BY lead."createdAt" DESC
      LIMIT 250
    `,
    prisma.$queryRaw<PlayerOptionRow[]>`
      SELECT u."id", u."name", u."email"
      FROM "User" u
      WHERE u."email" IS NOT NULL
        AND BTRIM(u."email") <> ''
        AND EXISTS (
          SELECT 1
          FROM "TeamMember" member
          WHERE member."userId" = u."id"
        )
      ORDER BY COALESCE(NULLIF(BTRIM(u."name"), ''), u."email"), u."email"
    `,
  ]);

  const readyCount = referrals.filter((row) => referralStatus(row) === "READY").length;
  const unpaidValue = referrals
    .filter((row) => referralStatus(row) === "READY")
    .reduce((total, row) => total + row.rewardPence, 0);
  const attachError = errorMessage(sp.error);

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

      {sp.added === "1" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800">
          Referral added. SIXFL will now track that team towards the player&apos;s £75 reward.
        </div>
      ) : null}

      {attachError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          {attachError}
        </div>
      ) : null}

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm sm:p-6">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Existing lead</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Attach an existing team lead to a referral</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use this when a team was already in SIXFL Leads before they used the player&apos;s referral link. This does not recreate or change the lead — it simply links the existing lead to the referring player and starts the normal three-completed-match reward tracking.
          </p>
        </div>

        {availableLeads.length === 0 ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            There are no unlinked team leads available to add to the referral system.
          </div>
        ) : playerOptions.length === 0 ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            No eligible player accounts with email addresses were found.
          </div>
        ) : (
          <form action={attachExistingLeadReferralAction} className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_1fr_auto] lg:items-end">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">Existing team lead</span>
              <select
                name="leadId"
                required
                defaultValue=""
                className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
              >
                <option value="" disabled>Select a team lead…</option>
                {availableLeads.map((lead) => {
                  const teamLabel = lead.convertedTeamName ?? lead.teamName ?? "Unnamed team";
                  const area = lead.area ? ` · ${lead.area}` : "";
                  return (
                    <option key={lead.id} value={lead.id}>
                      {teamLabel} · {lead.contactName} · {lead.email}{area}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">Referring player</span>
              <select
                name="referrerUserId"
                required
                defaultValue=""
                className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
              >
                <option value="" disabled>Select a player…</option>
                {playerOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name?.trim() || "Player"} · {player.email}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-500"
            >
              Add referral
            </button>
          </form>
        )}

        <p className="mt-4 text-xs leading-5 text-slate-500">
          A lead can only be linked to one referrer. The player and lead cannot use the same email address.
        </p>
      </section>

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
