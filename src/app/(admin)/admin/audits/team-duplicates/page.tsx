// ========================================
// File: src/app/(admin)/admin/audits/team-duplicates/page.tsx
// ========================================

import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type TeamDuplicateAuditRow = {
  duplicateKey: string;
  id: string;
  name: string;
  leagueId: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
  divisionId: string | null;
  divisionName: string | null;
  competitionId: string | null;
  competitionName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  captainUserId: string | null;
  captainLinkedAt: Date | null;
  captainClaimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  leagueSeasonTeamEntries: string | null;
  suggestedCanonicalScore: number;
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

function groupRows(rows: TeamDuplicateAuditRow[]) {
  const groups = new Map<string, TeamDuplicateAuditRow[]>();

  for (const row of rows) {
    const existing = groups.get(row.duplicateKey) ?? [];
    existing.push(row);
    groups.set(row.duplicateKey, existing);
  }

  return Array.from(groups.entries()).map(([key, groupRows]) => ({
    key,
    rows: groupRows.sort((a, b) => b.suggestedCanonicalScore - a.suggestedCanonicalScore),
  }));
}

async function getDuplicateTeamAuditRows() {
  return prisma.$queryRaw<TeamDuplicateAuditRow[]>(Prisma.sql`
    WITH team_context AS (
      SELECT
        t."id",
        t."name",
        lower(regexp_replace(trim(t."name"), '\\s+', ' ', 'g')) AS "duplicateKey",
        t."leagueId",
        l."name" AS "leagueName",
        l."season" AS "leagueSeason",
        t."divisionId",
        d."name" AS "divisionName",
        COALESCE(t."competitionId", l."competitionId") AS "competitionId",
        c."name" AS "competitionName",
        t."contactEmail",
        t."contactPhone",
        t."captainUserId",
        t."captainLinkedAt",
        t."captainClaimedAt",
        t."createdAt",
        t."updatedAt",
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
        (
          SELECT string_agg(
            concat_ws(' / ', sl."name", sl."season", sd."name"),
            ' | '
            ORDER BY sl."name", sl."season", sd."sortOrder", sd."name"
          )
          FROM "LeagueSeasonTeam" lst
          JOIN "League" sl ON sl."id" = lst."leagueId"
          LEFT JOIN "LeagueDivision" sd ON sd."id" = lst."divisionId"
          WHERE lst."teamId" = t."id"
        ) AS "leagueSeasonTeamEntries"
      FROM "Team" t
      LEFT JOIN "League" l ON l."id" = t."leagueId"
      LEFT JOIN "LeagueDivision" d ON d."id" = t."divisionId"
      LEFT JOIN "LeagueCompetition" c ON c."id" = COALESCE(t."competitionId", l."competitionId")
    ),
    duplicate_keys AS (
      SELECT "duplicateKey"
      FROM team_context
      GROUP BY "duplicateKey"
      HAVING COUNT(*) > 1
    )
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
      )::int AS "suggestedCanonicalScore"
    FROM team_context
    WHERE "duplicateKey" IN (SELECT "duplicateKey" FROM duplicate_keys)
    ORDER BY
      "duplicateKey",
      "suggestedCanonicalScore" DESC,
      "teamMemberCount" DESC,
      "prospectCount" DESC,
      "fixtureCount" DESC,
      "createdAt" ASC
  `);
}

export default async function TeamDuplicateAuditPage() {
  await requireAdmin();

  const rows = await getDuplicateTeamAuditRows();
  const groups = groupRows(rows);
  const totalRows = rows.length;

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Read-only audit
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              Duplicate team audit
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              This page only reads data. It does not merge, delete, archive or update teams. Use it to decide which Team.id should be canonical before any migration.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 px-5 py-4 text-sm text-white/70">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Suspected groups
            </div>
            <div className="mt-2 text-3xl font-semibold text-white">{groups.length}</div>
            <div className="mt-1 text-xs text-white/45">{totalRows} team rows</div>
          </div>
        </div>
      </AdminCard>

      {groups.length === 0 ? (
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
          No suspected duplicate team names were found.
        </AdminCard>
      ) : null}

      {groups.map((group) => {
        const suggested = group.rows[0];

        return (
          <AdminCard key={group.key} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-0">
            <div className="border-b border-white/10 px-6 py-5 md:px-8">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                Duplicate group
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">{group.key}</h2>
              <p className="mt-2 text-sm text-white/55">
                Suggested canonical candidate: <span className="font-mono text-emerald-200">{suggested.id}</span> · {suggested.name}. This is a scoring hint only.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1800px] text-left text-xs">
                <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.14em] text-white/40">
                  <tr>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">League / division</th>
                    <th className="px-4 py-3">Competition</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Captain</th>
                    <th className="px-4 py-3 text-right">Members</th>
                    <th className="px-4 py-3 text-right">Prospects</th>
                    <th className="px-4 py-3 text-right">Fixtures</th>
                    <th className="px-4 py-3 text-right">Charges</th>
                    <th className="px-4 py-3 text-right">Transactions</th>
                    <th className="px-4 py-3 text-right">Player fees</th>
                    <th className="px-4 py-3 text-right">Confirms</th>
                    <th className="px-4 py-3 text-right">Threads</th>
                    <th className="px-4 py-3 text-right">Result meta</th>
                    <th className="px-4 py-3 text-right">Disputes</th>
                    <th className="px-4 py-3">Season entries</th>
                    <th className="px-4 py-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {group.rows.map((row) => (
                    <tr key={row.id} className={row.id === suggested.id ? "bg-emerald-500/5" : "bg-black/10"}>
                      <td className="px-4 py-4 align-top">
                        <div className="font-semibold text-white">{row.name}</div>
                        <div className="mt-1 font-mono text-[11px] text-white/45">{row.id}</div>
                        <div className="mt-1 text-white/35">Created {formatDate(row.createdAt)}</div>
                      </td>
                      <td className="px-4 py-4 align-top text-white/70">
                        <div>{row.leagueName ?? "—"}</div>
                        <div className="text-white/40">{row.leagueSeason ?? "No season"}</div>
                        <div className="text-sky-200/70">{row.divisionName ?? "No division"}</div>
                      </td>
                      <td className="px-4 py-4 align-top text-white/65">{row.competitionName ?? "—"}</td>
                      <td className="px-4 py-4 align-top text-white/65">
                        <div>{row.contactEmail ?? "—"}</div>
                        <div className="text-white/40">{row.contactPhone ?? "—"}</div>
                      </td>
                      <td className="px-4 py-4 align-top text-white/65">
                        <div className="font-mono text-[11px]">{row.captainUserId ?? "—"}</div>
                        <div className="text-white/40">Linked {formatDate(row.captainLinkedAt)}</div>
                        <div className="text-white/40">Claimed {formatDate(row.captainClaimedAt)}</div>
                      </td>
                      <td className="px-4 py-4 text-right align-top text-white">{row.teamMemberCount}</td>
                      <td className="px-4 py-4 text-right align-top text-white">{row.prospectCount}</td>
                      <td className="px-4 py-4 text-right align-top text-white">{row.fixtureCount}</td>
                      <td className="px-4 py-4 text-right align-top text-white">{row.paymentChargeCount}</td>
                      <td className="px-4 py-4 text-right align-top text-white">{row.paymentTransactionCount}</td>
                      <td className="px-4 py-4 text-right align-top text-white">{row.playerMatchFeeCount}</td>
                      <td className="px-4 py-4 text-right align-top text-white">{row.fixtureCaptainConfirmationCount}</td>
                      <td className="px-4 py-4 text-right align-top text-white">{row.messageThreadCount}</td>
                      <td className="px-4 py-4 text-right align-top text-white">{row.resultMetaCount}</td>
                      <td className="px-4 py-4 text-right align-top text-white">{row.resultDisputeCount}</td>
                      <td className="max-w-xl px-4 py-4 align-top text-white/60">{row.leagueSeasonTeamEntries ?? "—"}</td>
                      <td className="px-4 py-4 text-right align-top font-semibold text-emerald-200">{row.suggestedCanonicalScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminCard>
        );
      })}
    </div>
  );
}
