// ========================================
// File: src/app/(admin)/admin/audits/league-structure/page.tsx
// ========================================

import Link from "next/link";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "League Structure Audit | SIXFL Admin",
};

type CompetitionRow = {
  competitionId: string;
  competitionName: string;
  currentLeagueId: string | null;
  currentSeason: string | null;
  seasonCount: number;
  activeSeasonCount: number;
  currentSeasonTeamCount: number;
};

type UngroupedSeasonRow = {
  leagueId: string;
  leagueName: string;
  season: string | null;
  isActive: boolean;
  teamCount: number;
  fixtureCount: number;
};

type MismatchRow = {
  seasonEntryId: string;
  teamId: string;
  teamName: string;
  seasonLeagueId: string;
  seasonLeagueName: string;
  season: string | null;
  seasonCompetitionName: string | null;
  teamLeagueName: string | null;
  teamLeagueSeason: string | null;
  teamCompetitionName: string | null;
  reason: string;
};

type MultiSeasonRow = {
  teamId: string;
  teamName: string;
  activeSeasonCount: number;
  seasonLabels: string;
};

type RawLeaguePickerRisk = {
  area: string;
  path: string;
  risk: string;
  expectedFix: string;
};

const rawLeaguePickerRisks: RawLeaguePickerRisk[] = [
  {
    area: "Communications league launcher",
    path: "/admin/messaging",
    risk: "Was showing Spring and Summer as separate league choices.",
    expectedFix: "Fixed: now uses parent competition current season where available.",
  },
  {
    area: "Fixture console / generators",
    path: "/admin/fixtures, /admin/fixtures/generate, /admin/fixtures/backfill",
    risk: "May need specific season selection, but wording should say season, not league identity.",
    expectedFix: "Review whether each dropdown is choosing a season or a parent competition.",
  },
  {
    area: "Social results",
    path: "/admin/social/results",
    risk: "May still list raw League rows.",
    expectedFix: "Use season wording if results are season-specific.",
  },
  {
    area: "Referee night tools",
    path: "/admin/referee-nights",
    risk: "May still list raw League rows.",
    expectedFix: "Use season wording if assigning to a fixture season.",
  },
  {
    area: "Team settings",
    path: "/admin/teams/[id]",
    risk: "Team should point at parent competition/current season, while season entries decide seasonal participation.",
    expectedFix: "Review labels so this does not imply teams move permanently every season.",
  },
];

function n(value: number | null | undefined) {
  return Number(value ?? 0);
}

function seasonLabel(input: { name: string; season: string | null }) {
  return `${input.name}${input.season ? ` · ${input.season}` : ""}`;
}

function badgeClass(tone: "ok" | "warn" | "danger" | "info") {
  switch (tone) {
    case "ok":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "danger":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    case "info":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    default:
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  }
}

export default async function LeagueStructureAuditPage() {
  await requireAdmin();

  const [competitionRows, ungroupedRows, mismatchRows, multiSeasonRows] = await Promise.all([
    prisma.$queryRaw<CompetitionRow[]>(Prisma.sql`
      SELECT
        c."id" AS "competitionId",
        c."name" AS "competitionName",
        c."currentLeagueId",
        current_l."season" AS "currentSeason",
        COUNT(DISTINCT l."id")::int AS "seasonCount",
        COUNT(DISTINCT CASE WHEN l."isActive" THEN l."id" END)::int AS "activeSeasonCount",
        COUNT(DISTINCT current_lst."teamId")::int AS "currentSeasonTeamCount"
      FROM "LeagueCompetition" c
      LEFT JOIN "League" current_l ON current_l."id" = c."currentLeagueId"
      LEFT JOIN "League" l ON l."competitionId" = c."id"
      LEFT JOIN "LeagueSeasonTeam" current_lst
        ON current_lst."leagueId" = c."currentLeagueId"
       AND current_lst."isActive" = true
      WHERE c."isActive" = true
      GROUP BY c."id", c."name", c."currentLeagueId", current_l."season"
      ORDER BY c."name" ASC
    `),
    prisma.$queryRaw<UngroupedSeasonRow[]>(Prisma.sql`
      SELECT
        l."id" AS "leagueId",
        l."name" AS "leagueName",
        l."season",
        l."isActive",
        COUNT(DISTINCT lst."teamId")::int AS "teamCount",
        COUNT(DISTINCT f."id")::int AS "fixtureCount"
      FROM "League" l
      LEFT JOIN "LeagueSeasonTeam" lst ON lst."leagueId" = l."id" AND lst."isActive" = true
      LEFT JOIN "Fixture" f ON f."leagueId" = l."id"
      WHERE l."competitionId" IS NULL
      GROUP BY l."id", l."name", l."season", l."isActive"
      ORDER BY l."isActive" DESC, l."createdAt" DESC
    `),
    prisma.$queryRaw<MismatchRow[]>(Prisma.sql`
      SELECT
        lst."id" AS "seasonEntryId",
        t."id" AS "teamId",
        t."name" AS "teamName",
        season_l."id" AS "seasonLeagueId",
        season_l."name" AS "seasonLeagueName",
        season_l."season",
        season_c."name" AS "seasonCompetitionName",
        team_l."name" AS "teamLeagueName",
        team_l."season" AS "teamLeagueSeason",
        team_c."name" AS "teamCompetitionName",
        CASE
          WHEN season_l."competitionId" IS NULL AND t."leagueId" IS DISTINCT FROM lst."leagueId"
            THEN 'Team has active entry in an ungrouped season that is not its main league.'
          WHEN season_l."competitionId" IS NOT NULL
           AND COALESCE(t."competitionId", team_l."competitionId") IS DISTINCT FROM season_l."competitionId"
            THEN 'Team competition does not match this season competition.'
          ELSE 'Review season membership.'
        END AS "reason"
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      JOIN "League" season_l ON season_l."id" = lst."leagueId"
      LEFT JOIN "LeagueCompetition" season_c ON season_c."id" = season_l."competitionId"
      LEFT JOIN "League" team_l ON team_l."id" = t."leagueId"
      LEFT JOIN "LeagueCompetition" team_c ON team_c."id" = COALESCE(t."competitionId", team_l."competitionId")
      WHERE lst."isActive" = true
        AND (
          (season_l."competitionId" IS NULL AND t."leagueId" IS DISTINCT FROM lst."leagueId")
          OR (
            season_l."competitionId" IS NOT NULL
            AND COALESCE(t."competitionId", team_l."competitionId") IS DISTINCT FROM season_l."competitionId"
          )
        )
      ORDER BY season_l."name" ASC, season_l."season" DESC NULLS LAST, t."name" ASC
    `),
    prisma.$queryRaw<MultiSeasonRow[]>(Prisma.sql`
      SELECT
        t."id" AS "teamId",
        t."name" AS "teamName",
        COUNT(DISTINCT lst."leagueId")::int AS "activeSeasonCount",
        STRING_AGG(l."name" || COALESCE(' · ' || l."season", ''), ' | ' ORDER BY l."name", l."season") AS "seasonLabels"
      FROM "Team" t
      JOIN "LeagueSeasonTeam" lst ON lst."teamId" = t."id" AND lst."isActive" = true
      JOIN "League" l ON l."id" = lst."leagueId"
      GROUP BY t."id", t."name"
      HAVING COUNT(DISTINCT lst."leagueId") > 1
      ORDER BY COUNT(DISTINCT lst."leagueId") DESC, t."name" ASC
    `),
  ]);

  const competitions = competitionRows.map((row) => ({
    ...row,
    seasonCount: n(row.seasonCount),
    activeSeasonCount: n(row.activeSeasonCount),
    currentSeasonTeamCount: n(row.currentSeasonTeamCount),
  }));
  const ungrouped = ungroupedRows.map((row) => ({
    ...row,
    teamCount: n(row.teamCount),
    fixtureCount: n(row.fixtureCount),
  }));
  const mismatches = mismatchRows;
  const multiSeasonTeams = multiSeasonRows.map((row) => ({
    ...row,
    activeSeasonCount: n(row.activeSeasonCount),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/admin/audits" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
            ← Back to audits
          </Link>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            League structure audit
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Competitions, seasons and team entries
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/60">
            Checks whether the site is treating ongoing leagues as parent competitions and using season-entry rows for seasonal participation. This helps find places where Spring/Summer are still being treated as separate permanent leagues.
          </p>
        </div>

        <Link
          href="/admin/leagues"
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
        >
          Open leagues
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Parent competitions</p>
          <p className="mt-3 text-3xl font-semibold text-white">{competitions.length}</p>
        </div>
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Ungrouped seasons</p>
          <p className="mt-3 text-3xl font-semibold text-white">{ungrouped.length}</p>
        </div>
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/70">Mismatch entries</p>
          <p className="mt-3 text-3xl font-semibold text-white">{mismatches.length}</p>
        </div>
        <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">Multi-season teams</p>
          <p className="mt-3 text-3xl font-semibold text-white">{multiSeasonTeams.length}</p>
        </div>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Parent competitions</h2>
            <p className="mt-1 text-sm text-white/55">These should be the ongoing league identities, such as Harrogate Tuesday.</p>
          </div>
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${competitions.length ? badgeClass("ok") : badgeClass("warn")}`}>
            {competitions.length} found
          </span>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[11px] uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-4 py-3">Competition</th>
                <th className="px-4 py-3">Current season</th>
                <th className="px-4 py-3">Seasons</th>
                <th className="px-4 py-3">Current teams</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {competitions.map((row) => (
                <tr key={row.competitionId}>
                  <td className="px-4 py-3 font-semibold text-white">{row.competitionName}</td>
                  <td className="px-4 py-3 text-white/70">{row.currentSeason || "Not set"}</td>
                  <td className="px-4 py-3 text-white/70">{row.seasonCount} total · {row.activeSeasonCount} active</td>
                  <td className="px-4 py-3 text-white/70">{row.currentSeasonTeamCount}</td>
                </tr>
              ))}
              {competitions.length === 0 ? (
                <tr><td className="px-4 py-8 text-white/55" colSpan={4}>No parent competitions found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.05] p-6">
        <h2 className="text-xl font-semibold text-white">Ungrouped league seasons</h2>
        <p className="mt-1 text-sm text-white/55">
          These are season records not yet linked under a parent competition. Some may be new leagues that need promoting into a parent competition.
        </p>
        <div className="mt-5 divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/20">
          {ungrouped.map((row) => (
            <Link key={row.leagueId} href={`/admin/leagues/${row.leagueId}`} className="block px-4 py-4 transition hover:bg-white/[0.04]">
              <div className="font-semibold text-white">{seasonLabel({ name: row.leagueName, season: row.season })}</div>
              <div className="mt-1 text-xs text-white/45">
                {row.isActive ? "Active" : "Inactive"} · {row.teamCount} team{row.teamCount === 1 ? "" : "s"} · {row.fixtureCount} fixture{row.fixtureCount === 1 ? "" : "s"}
              </div>
            </Link>
          ))}
          {ungrouped.length === 0 ? <div className="px-4 py-8 text-sm text-white/55">No ungrouped seasons found.</div> : null}
        </div>
      </section>

      <section className="rounded-3xl border border-red-400/20 bg-red-500/[0.04] p-6">
        <h2 className="text-xl font-semibold text-white">Season entry mismatches</h2>
        <p className="mt-1 text-sm text-white/55">
          These are teams active in a season where their main team competition/league does not appear to match. This is where wrong entries like AHC AFC in the wrong Summer season should appear.
        </p>
        <div className="mt-5 divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/20">
          {mismatches.map((row) => (
            <div key={row.seasonEntryId} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_1fr_1.4fr]">
              <div>
                <Link href={`/admin/teams/${row.teamId}`} className="font-semibold text-white hover:text-emerald-200">
                  {row.teamName}
                </Link>
                <div className="mt-1 text-xs text-white/45">Team main: {row.teamCompetitionName || row.teamLeagueName || "None"}{row.teamLeagueSeason ? ` · ${row.teamLeagueSeason}` : ""}</div>
              </div>
              <div>
                <Link href={`/admin/leagues/${row.seasonLeagueId}`} className="font-semibold text-white/85 hover:text-emerald-200">
                  {seasonLabel({ name: row.seasonLeagueName, season: row.season })}
                </Link>
                <div className="mt-1 text-xs text-white/45">Season competition: {row.seasonCompetitionName || "Ungrouped"}</div>
              </div>
              <div className="text-sm text-red-100/80">{row.reason}</div>
            </div>
          ))}
          {mismatches.length === 0 ? <div className="px-4 py-8 text-sm text-white/55">No obvious season-entry mismatches found.</div> : null}
        </div>
      </section>

      <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.04] p-6">
        <h2 className="text-xl font-semibold text-white">Teams active in multiple seasons</h2>
        <p className="mt-1 text-sm text-white/55">
          This can be normal during season rollover, but it is worth checking where a team is active in two unrelated seasons.
        </p>
        <div className="mt-5 divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/20">
          {multiSeasonTeams.map((row) => (
            <div key={row.teamId} className="px-4 py-4">
              <Link href={`/admin/teams/${row.teamId}`} className="font-semibold text-white hover:text-emerald-200">
                {row.teamName}
              </Link>
              <div className="mt-1 text-xs text-white/45">{row.activeSeasonCount} active season entries</div>
              <div className="mt-2 text-sm text-white/70">{row.seasonLabels}</div>
            </div>
          ))}
          {multiSeasonTeams.length === 0 ? <div className="px-4 py-8 text-sm text-white/55">No teams are active in more than one season.</div> : null}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <h2 className="text-xl font-semibold text-white">Dropdown/code audit list</h2>
        <p className="mt-1 text-sm text-white/55">
          These are the main places to review when Spring/Summer are being treated as separate permanent leagues.
        </p>
        <div className="mt-5 divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/20">
          {rawLeaguePickerRisks.map((item) => (
            <div key={item.path} className="grid gap-3 px-4 py-4 lg:grid-cols-[0.8fr_1fr_1fr]">
              <div>
                <div className="font-semibold text-white">{item.area}</div>
                <div className="mt-1 font-mono text-xs text-white/45">{item.path}</div>
              </div>
              <div className="text-sm text-white/65">{item.risk}</div>
              <div className="text-sm text-emerald-100/75">{item.expectedFix}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
