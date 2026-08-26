import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamReferrals, referralStatus } from "@/lib/team-referrals";
import {
  attachExistingLeadReferralAction,
  retryReferralRecordedEmailAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Team Referrals | SIXFL Admin" };

type SearchParams = Promise<{
  added?: string;
  error?: string;
  email?: string;
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

type ReferralEmailDeliveryRow = {
  referralId: string;
  dispatchId: string | null;
  status: string | null;
  failureReason: string | null;
  createdAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
};

const RECOVERABLE_MISSING_EMAIL_REASON = "Recipient has no email address.";
const RECOVERABLE_CHANNEL_DISABLED_REASON = "Recipient email notifications are disabled.";

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function date(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(value);
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

function emailNotice(value?: string) {
  switch (value) {
    case "queued":
      return {
        tone: "success" as const,
        message: "Referral confirmation email queued. The notification worker will send it shortly.",
      };
    case "already":
      return {
        tone: "info" as const,
        message: "That referral email is already queued, sending, or has been sent.",
      };
    case "blocked":
      return {
        tone: "warning" as const,
        message: "SIXFL did not retry that email because the recipient is suppressed or has explicitly disabled transactional email.",
      };
    case "no_email":
      return {
        tone: "warning" as const,
        message: "That player does not currently have an email address on their SIXFL account.",
      };
    case "not_found":
      return {
        tone: "error" as const,
        message: "That referral could not be found.",
      };
    case "missing":
    case "failed":
      return {
        tone: "error" as const,
        message: "SIXFL could not queue that referral email. Check the delivery status below and try again after correcting the issue.",
      };
    default:
      return null;
  }
}

function noticeClass(tone: "success" | "info" | "warning" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "info") return "border-sky-200 bg-sky-50 text-sky-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-800";
}

function emailStatusLabel(status: string | null) {
  switch (status) {
    case "SENT":
      return "Sent";
    case "QUEUED":
      return "Queued";
    case "PROCESSING":
      return "Sending";
    case "FAILED":
      return "Failed";
    case "SKIPPED":
      return "Skipped";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Not queued";
  }
}

function emailStatusClass(status: string | null) {
  switch (status) {
    case "SENT":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "QUEUED":
    case "PROCESSING":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "FAILED":
    case "CANCELLED":
      return "border-red-200 bg-red-50 text-red-800";
    case "SKIPPED":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function canRetryReferralEmail(delivery?: ReferralEmailDeliveryRow) {
  if (!delivery?.dispatchId) return true;
  if (delivery.status === "FAILED") return true;
  return (
    delivery.status === "SKIPPED" &&
    (delivery.failureReason === RECOVERABLE_MISSING_EMAIL_REASON ||
      delivery.failureReason === RECOVERABLE_CHANNEL_DISABLED_REASON)
  );
}

export default async function AdminReferralsPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};

  const [referrals, availableLeads, playerOptions, referralEmailDeliveries] = await Promise.all([
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
    prisma.$queryRaw<ReferralEmailDeliveryRow[]>`
      SELECT
        referral."id" AS "referralId",
        dispatch."id" AS "dispatchId",
        dispatch."status"::text AS "status",
        dispatch."failureReason",
        dispatch."createdAt",
        dispatch."sentAt",
        dispatch."failedAt"
      FROM "TeamReferral" referral
      LEFT JOIN LATERAL (
        SELECT
          item."id",
          item."status",
          item."failureReason",
          item."createdAt",
          item."sentAt",
          item."failedAt"
        FROM "NotificationDispatch" item
        WHERE item."sourceType" = 'team-referral-recorded'
          AND item."sourceId" = referral."id"
        ORDER BY item."createdAt" DESC
        LIMIT 1
      ) dispatch ON TRUE
    `,
  ]);

  const referralEmailById = new Map(
    referralEmailDeliveries.map((delivery) => [delivery.referralId, delivery]),
  );
  const readyCount = referrals.filter((row) => referralStatus(row) === "READY").length;
  const unpaidValue = referrals
    .filter((row) => referralStatus(row) === "READY")
    .reduce((total, row) => total + row.rewardPence, 0);
  const attachError = errorMessage(sp.error);
  const retryNotice = emailNotice(sp.email);

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

      {retryNotice ? (
        <div className={`rounded-2xl border px-5 py-4 text-sm font-bold ${noticeClass(retryNotice.tone)}`}>
          {retryNotice.message}
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
              const emailDelivery = referralEmailById.get(row.id);
              return (
                <div key={row.id} className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1.2fr_0.8fr_auto] lg:items-center">
                  <div>
                    <p className="font-black text-slate-950">{row.referrerName ?? row.referrerEmail ?? "Player"}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.referrerEmail ?? "No email"}</p>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Referral email</span>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${emailStatusClass(emailDelivery?.status ?? null)}`}>
                          {emailStatusLabel(emailDelivery?.status ?? null)}
                        </span>
                      </div>
                      {emailDelivery?.status === "SENT" && emailDelivery.sentAt ? (
                        <p className="mt-2 text-xs text-slate-500">Sent {dateTime(emailDelivery.sentAt)}</p>
                      ) : emailDelivery?.status === "QUEUED" && emailDelivery.createdAt ? (
                        <p className="mt-2 text-xs text-slate-500">Queued {dateTime(emailDelivery.createdAt)}</p>
                      ) : emailDelivery?.status === "PROCESSING" ? (
                        <p className="mt-2 text-xs text-slate-500">The notification worker is sending this now.</p>
                      ) : emailDelivery?.failureReason ? (
                        <p className="mt-2 text-xs leading-5 text-slate-600">{emailDelivery.failureReason}</p>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">No confirmation email attempt has been recorded yet.</p>
                      )}
                      {canRetryReferralEmail(emailDelivery) ? (
                        <form action={retryReferralRecordedEmailAction} className="mt-3">
                          <input type="hidden" name="referralId" value={row.id} />
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-800 transition hover:bg-sky-100"
                          >
                            Retry email
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{displayedTeam}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.leagueName ?? "Not assigned to a league yet"} · referred {date(row.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{Math.min(row.completedMatches, row.requiredMatches)} of {row.requiredMatches} matches</p>
                    <p className="mt-1 text-xs text-slate-500">Reward: {money(row.rewardPence)}</p>
                    {status === "READY" ? (
                      <p className={`mt-1 text-xs font-bold ${row.payoutDetailsSubmittedAt ? "text-emerald-700" : "text-amber-700"}`}>
                        {row.payoutDetailsSubmittedAt ? "Payment details received" : "Awaiting payment details"}
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-36 text-left lg:text-right">
                    {status === "PAID" ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">Paid</span>
                    ) : status === "READY" ? (
                      <Link
                        href={`/admin/referrals/payout/${encodeURIComponent(row.id)}`}
                        className={`inline-flex rounded-xl px-4 py-2 text-sm font-black ${row.payoutDetailsSubmittedAt ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-amber-100 text-amber-900 hover:bg-amber-200"}`}
                      >
                        {row.payoutDetailsSubmittedAt ? "View bank details" : "Awaiting bank details"}
                      </Link>
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
