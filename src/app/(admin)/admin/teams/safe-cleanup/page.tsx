// ========================================
// File: src/app/(admin)/admin/teams/safe-cleanup/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotificationRecipientSourceType, Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type CleanupRow = {
  duplicateKey: string;
  duplicateNameCount: number;
  id: string;
  name: string;
  leagueName: string | null;
  leagueSeason: string | null;
  divisionName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  captainUserId: string | null;
  captainInviteSentAt: Date | null;
  captainClaimedAt: Date | null;
  createdAt: Date;
  teamMemberCount: number;
  prospectCount: number;
  fixtureCount: number;
  paymentChargeCount: number;
  paymentTransactionCount: number;
  playerMatchFeeCount: number;
  fixtureCaptainConfirmationCount: number;
  messageThreadCount: number;
  resultMetaCount: number;
  resultDisputeCount: number;
  leagueSeasonTeamCount: number;
  convertedLeadCount: number;
  notificationDispatchCount: number;
  suggestedCanonicalId: string;
  suggestedCanonicalName: string;
  suggestedCanonicalScore: number;
  blockerCount: number;
};

type SearchParams = {
  deleted?: string;
  error?: string;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function countPill(label: string, value: number) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] ${value > 0 ? "border-amber-400/25 bg-amber-500/10 text-amber-100" : "border-white/10 bg-white/[0.04] text-white/50"}`}>
      {label}: {value}
    </span>
  );
}

function getErrorMessage(error?: string) {
  switch (error) {
    case "missing_id":
      return "No team was selected.";
    case "not_duplicate":
      return "That team is not in a duplicate-name group, so it was not removed.";
    case "not_safe":
      return "That team still has linked data, so it was not removed.";
    case "not_found":
      return "That team could not be found.";
    default:
      return null;
  }
}

async function getCleanupRows() {
  return prisma.$queryRaw<CleanupRow[]>(Prisma.sql`
    WITH team_context AS (
      SELECT
        t."id",
        t."name",
        lower(regexp_replace(trim(t."name"), '\s+', ' ', 'g')) AS "duplicateKey",
        l."name" AS "leagueName",
        l."season" AS "leagueSeason",
        d."name" AS "divisionName",
        t."contactEmail",
        t."contactPhone",
        t."captainUserId",
        t."captainInviteSentAt",
        t."captainClaimedAt",
        t."createdAt",
        (SELECT COUNT(*)::int FROM "TeamMember" tm WHERE tm."teamId" = t."id") AS "teamMemberCount",
        (SELECT COUNT(*)::int FROM "TeamPlayerProspect" tp WHERE tp."teamId" = t."id") AS "prospectCount",
        (SELECT COUNT(*)::int FROM "Fixture" f WHERE f."homeTeamId" = t."id" OR f."awayTeamId" = t."id") AS "fixtureCount",
        (SELECT COUNT(*)::int FROM "PaymentCharge" pc WHERE pc."teamId" = t."id") AS "paymentChargeCount",
        (SELECT COUNT(*)::int FROM "PaymentTransaction" pt WHERE pt."teamId" = t."id") AS "paymentTransactionCount",
        (SELECT COUNT(*)::int FROM "PlayerMatchFee" pmf WHERE pmf."teamId" = t."id") AS "playerMatchFeeCount",
        (SELECT COUNT(*)::int FROM "FixtureCaptainConfirmation" fcc WHERE fcc."teamId" = t."id") AS "fixtureCaptainConfirmationCount",
        (SELECT COUNT(*)::int FROM "MessageThread" mt WHERE mt."teamId" = t."id") AS "messageThreadCount",
        (SELECT COUNT(*)::int FROM "MatchResultTeamMeta" meta WHERE meta."teamId" = t."id") AS "resultMetaCount",
        (SELECT COUNT(*)::int FROM "ResultDispute" rd WHERE rd."teamId" = t."id") AS "resultDisputeCount",
        (SELECT COUNT(*)::int FROM "LeagueSeasonTeam" lst WHERE lst."teamId" = t."id") AS "leagueSeasonTeamCount",
        (SELECT COUNT(*)::int FROM "InterestLead" lead WHERE lead."convertedTeamId" = t."id") AS "convertedLeadCount",
        (
          SELECT COUNT(*)::int
          FROM "NotificationRecipient" nr
          JOIN "NotificationDispatch" nd ON nd."recipientId" = nr."id"
          WHERE nr."sourceType" = 'TEAM'
            AND nr."sourceId" = t."id"
        ) AS "notificationDispatchCount"
      FROM "Team" t
      LEFT JOIN "League" l ON l."id" = t."leagueId"
      LEFT JOIN "LeagueDivision" d ON d."id" = t."divisionId"
    ),
    scored AS (
      SELECT
        *,
        (
          "teamMemberCount" * 1000 +
          "prospectCount" * 200 +
          "fixtureCount" * 100 +
          "paymentChargeCount" * 50 +
          "paymentTransactionCount" * 50 +
          "playerMatchFeeCount" * 25 +
          "leagueSeasonTeamCount" * 20 +
          CASE WHEN "captainClaimedAt" IS NOT NULL THEN 500 ELSE 0 END +
          CASE WHEN "captainUserId" IS NOT NULL THEN 250 ELSE 0 END
        )::int AS "suggestedCanonicalScore",
        (
          "teamMemberCount" +
          "prospectCount" +
          "fixtureCount" +
          "paymentChargeCount" +
          "paymentTransactionCount" +
          "playerMatchFeeCount" +
          "fixtureCaptainConfirmationCount" +
          "messageThreadCount" +
          "resultMetaCount" +
          "resultDisputeCount" +
          "leagueSeasonTeamCount" +
          "convertedLeadCount" +
          "notificationDispatchCount" +
          CASE WHEN "captainUserId" IS NOT NULL THEN 1 ELSE 0 END
        )::int AS "blockerCount"
      FROM team_context
    ),
    duplicate_keys AS (
      SELECT "duplicateKey", COUNT(*)::int AS "duplicateNameCount"
      FROM scored
      GROUP BY "duplicateKey"
      HAVING COUNT(*) > 1
    ),
    canonical AS (
      SELECT DISTINCT ON ("duplicateKey")
        "duplicateKey",
        "id" AS "suggestedCanonicalId",
        "name" AS "suggestedCanonicalName",
        "suggestedCanonicalScore"
      FROM scored
      ORDER BY "duplicateKey", "suggestedCanonicalScore" DESC, "createdAt" ASC
    )
    SELECT
      s.*,
      dk."duplicateNameCount",
      c."suggestedCanonicalId",
      c."suggestedCanonicalName",
      c."suggestedCanonicalScore"
    FROM scored s
    JOIN duplicate_keys dk ON dk."duplicateKey" = s."duplicateKey"
    JOIN canonical c ON c."duplicateKey" = s."duplicateKey"
    WHERE s."id" <> c."suggestedCanonicalId"
    ORDER BY s."blockerCount" ASC, s."duplicateKey" ASC, s."createdAt" DESC
  `);
}

async function getSafeDeleteCheck(teamId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; duplicateNameCount: number; blockerCount: number }>>(Prisma.sql`
    WITH target AS (
      SELECT
        t."id",
        lower(regexp_replace(trim(t."name"), '\s+', ' ', 'g')) AS "duplicateKey",
        t."captainUserId"
      FROM "Team" t
      WHERE t."id" = ${teamId}
      LIMIT 1
    )
    SELECT
      target."id",
      (SELECT COUNT(*)::int FROM "Team" t WHERE lower(regexp_replace(trim(t."name"), '\s+', ' ', 'g')) = target."duplicateKey") AS "duplicateNameCount",
      (
        (SELECT COUNT(*)::int FROM "TeamMember" tm WHERE tm."teamId" = target."id") +
        (SELECT COUNT(*)::int FROM "TeamPlayerProspect" tp WHERE tp."teamId" = target."id") +
        (SELECT COUNT(*)::int FROM "Fixture" f WHERE f."homeTeamId" = target."id" OR f."awayTeamId" = target."id") +
        (SELECT COUNT(*)::int FROM "PaymentCharge" pc WHERE pc."teamId" = target."id") +
        (SELECT COUNT(*)::int FROM "PaymentTransaction" pt WHERE pt."teamId" = target."id") +
        (SELECT COUNT(*)::int FROM "PlayerMatchFee" pmf WHERE pmf."teamId" = target."id") +
        (SELECT COUNT(*)::int FROM "FixtureCaptainConfirmation" fcc WHERE fcc."teamId" = target."id") +
        (SELECT COUNT(*)::int FROM "MessageThread" mt WHERE mt."teamId" = target."id") +
        (SELECT COUNT(*)::int FROM "MatchResultTeamMeta" meta WHERE meta."teamId" = target."id") +
        (SELECT COUNT(*)::int FROM "ResultDispute" rd WHERE rd."teamId" = target."id") +
        (SELECT COUNT(*)::int FROM "LeagueSeasonTeam" lst WHERE lst."teamId" = target."id") +
        (SELECT COUNT(*)::int FROM "InterestLead" lead WHERE lead."convertedTeamId" = target."id") +
        (
          SELECT COUNT(*)::int
          FROM "NotificationRecipient" nr
          JOIN "NotificationDispatch" nd ON nd."recipientId" = nr."id"
          WHERE nr."sourceType" = 'TEAM'
            AND nr."sourceId" = target."id"
        ) +
        CASE WHEN target."captainUserId" IS NOT NULL THEN 1 ELSE 0 END
      )::int AS "blockerCount"
    FROM target
  `);

  return rows[0] ?? null;
}

async function safeDeleteDuplicateTeamAction(formData: FormData) {
  "use server";

  await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!teamId) redirect("/admin/teams/safe-cleanup?error=missing_id");

  const check = await getSafeDeleteCheck(teamId);
  if (!check) redirect("/admin/teams/safe-cleanup?error=not_found");
  if (check.duplicateNameCount < 2) redirect("/admin/teams/safe-cleanup?error=not_duplicate");
  if (check.blockerCount > 0) redirect("/admin/teams/safe-cleanup?error=not_safe");

  await prisma.$transaction(async (tx) => {
    await tx.notificationRecipient.deleteMany({
      where: {
        sourceType: NotificationRecipientSourceType.TEAM,
        sourceId: teamId,
      },
    });

    await tx.team.delete({
      where: { id: teamId },
    });
  });

  revalidatePath("/admin/teams");
  revalidatePath("/admin/teams/safe-cleanup");
  redirect(`/admin/teams/safe-cleanup?deleted=${encodeURIComponent(teamId)}`);
}

export default async function SafeTeamCleanupPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const rows = await getCleanupRows();
  const safeRows = rows.filter((row) => row.blockerCount === 0);
  const blockedRows = rows.filter((row) => row.blockerCount > 0);
  const errorMessage = getErrorMessage(sp.error);

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <AdminCard className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_34%),rgba(255,255,255,0.03)] p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Safe cleanup</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Duplicate team cleanup</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-white/60">
              This only offers removal for duplicate-name team rows that have no linked squad, prospects, fixtures, payments, messages, results, captain link, season entries or notification dispatches. Anything with data stays blocked.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/admin/teams" className="rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/[0.05]">Back to teams</Link>
              <Link href="/admin/audits/team-duplicates" className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/15">Open full audit</Link>
            </div>
          </div>
          <div className="grid min-w-[260px] gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Safe to remove</div>
              <div className="mt-2 text-3xl font-semibold text-white">{safeRows.length}</div>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100/70">Blocked</div>
              <div className="mt-2 text-3xl font-semibold text-white">{blockedRows.length}</div>
            </div>
          </div>
        </div>
      </AdminCard>

      {sp.deleted ? (
        <AdminCard className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Removed drained duplicate team row <span className="font-mono">{sp.deleted}</span>.
        </AdminCard>
      ) : null}

      {errorMessage ? (
        <AdminCard className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </AdminCard>
      ) : null}

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-0">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="text-xl font-semibold text-white">Safe candidates</h2>
          <p className="mt-1 text-sm text-white/50">These rows have zero blockers and a higher-scoring canonical team with the same name.</p>
        </div>
        <div className="divide-y divide-white/10">
          {safeRows.length === 0 ? <div className="px-6 py-8 text-sm text-white/55">No drained duplicate rows are currently safe to remove.</div> : null}
          {safeRows.map((row) => (
            <div key={row.id} className="grid gap-5 px-6 py-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] xl:items-center">
              <div>
                <div className="text-lg font-semibold text-white">{row.name}</div>
                <div className="mt-1 font-mono text-xs text-white/45">{row.id}</div>
                <div className="mt-2 text-sm text-white/55">Created {formatDate(row.createdAt)} · {row.contactEmail ?? "No email"} · {row.contactPhone ?? "No phone"}</div>
              </div>
              <div className="text-sm text-white/60">
                <div>Canonical: <span className="font-mono text-emerald-200">{row.suggestedCanonicalId}</span></div>
                <div className="mt-1">{row.suggestedCanonicalName} · score {row.suggestedCanonicalScore}</div>
                <div className="mt-1">League: {row.leagueName ?? "—"} / {row.leagueSeason ?? "—"} / {row.divisionName ?? "—"}</div>
              </div>
              <form action={safeDeleteDuplicateTeamAction} className="xl:justify-self-end">
                <input type="hidden" name="teamId" value={row.id} />
                <ConfirmDeleteButton
                  label="Remove safely"
                  confirmText={`Remove drained duplicate row for ${row.name}? This will only work if it still has zero linked records.`}
                  className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/20"
                />
              </form>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-0">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="text-xl font-semibold text-white">Blocked duplicate rows</h2>
          <p className="mt-1 text-sm text-white/50">These are duplicate-name rows, but they still have linked data or a captain link, so they are not removable here.</p>
        </div>
        <div className="divide-y divide-white/10">
          {blockedRows.length === 0 ? <div className="px-6 py-8 text-sm text-white/55">No blocked duplicate rows.</div> : null}
          {blockedRows.map((row) => (
            <div key={row.id} className="space-y-3 px-6 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="font-semibold text-white">{row.name}</div>
                  <div className="mt-1 font-mono text-xs text-white/45">{row.id}</div>
                  <div className="mt-2 text-sm text-white/55">Canonical suggestion: <span className="font-mono text-emerald-200">{row.suggestedCanonicalId}</span></div>
                </div>
                <div className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                  {row.blockerCount} blocker{row.blockerCount === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {countPill("Members", row.teamMemberCount)}
                {countPill("Prospects", row.prospectCount)}
                {countPill("Fixtures", row.fixtureCount)}
                {countPill("Charges", row.paymentChargeCount)}
                {countPill("Transactions", row.paymentTransactionCount)}
                {countPill("Player fees", row.playerMatchFeeCount)}
                {countPill("Confirms", row.fixtureCaptainConfirmationCount)}
                {countPill("Threads", row.messageThreadCount)}
                {countPill("Result meta", row.resultMetaCount)}
                {countPill("Disputes", row.resultDisputeCount)}
                {countPill("Season entries", row.leagueSeasonTeamCount)}
                {countPill("Converted leads", row.convertedLeadCount)}
                {countPill("Notification dispatches", row.notificationDispatchCount)}
                {row.captainUserId ? <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-100">Captain linked</span> : null}
              </div>
            </div>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}
