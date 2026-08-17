// ========================================
// File: src/app/(admin)/admin/leagues/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import LeagueForm from "@/components/admin/leagues/LeagueForm";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { createLeagueAction } from "@/app/(admin)/admin/leagues/actions";

type CompetitionRow = {
  id: string;
  name: string;
  slug: string;
  currentLeagueId: string | null;
  currentSeason: string | null;
  seasonCount: number;
  teamCount: number;
};

type SeasonRow = {
  id: string;
  competitionId: string | null;
  name: string;
  slug: string;
  season: string | null;
  isActive: boolean;
  isCurrent: boolean;
  teamCount: number;
  fixtureCount: number;
};

function normaliseCompetitionRows(rows: CompetitionRow[]) {
  return rows.map((row) => ({
    ...row,
    seasonCount: Number(row.seasonCount ?? 0),
    teamCount: Number(row.teamCount ?? 0),
  }));
}

function normaliseSeasonRows(rows: SeasonRow[]) {
  return rows.map((row) => ({
    ...row,
    isActive: Boolean(row.isActive),
    isCurrent: Boolean(row.isCurrent),
    teamCount: Number(row.teamCount ?? 0),
    fixtureCount: Number(row.fixtureCount ?? 0),
  }));
}

async function updateCompetitionNameAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const competitionId = String(formData.get("competitionId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!competitionId || !name || name.length > 160) return;

  const competition = await prisma.leagueCompetition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      leagues: {
        select: { slug: true },
      },
    },
  });

  if (!competition) return;

  await prisma.leagueCompetition.update({
    where: { id: competitionId },
    data: { name },
  });

  revalidatePath("/admin/leagues");
  revalidatePath("/leagues");
  for (const league of competition.leagues) {
    revalidatePath(`/leagues/${league.slug}`);
  }
}

export default async function AdminLeaguesPage() {
  await requireAdmin();

  const [competitionRows, seasonRows, ungroupedRows] = await Promise.all([
    prisma.$queryRaw<CompetitionRow[]>(Prisma.sql`
      SELECT
        c."id",
        c."name",
        c."slug",
        c."currentLeagueId",
        current_l."season" AS "currentSeason",
        COUNT(DISTINCT l."id")::int AS "seasonCount",
        COUNT(DISTINCT lst."teamId")::int AS "teamCount"
      FROM "LeagueCompetition" c
      LEFT JOIN "League" current_l ON current_l."id" = c."currentLeagueId"
      LEFT JOIN "League" l ON l."competitionId" = c."id"
      LEFT JOIN "LeagueSeasonTeam" lst ON lst."leagueId" = c."currentLeagueId" AND lst."isActive" = true
      WHERE c."isActive" = true
      GROUP BY c."id", c."name", c."slug", c."currentLeagueId", current_l."season"
      ORDER BY c."name" ASC
    `),
    prisma.$queryRaw<SeasonRow[]>(Prisma.sql`
      SELECT
        l."id",
        l."competitionId",
        l."name",
        l."slug",
        l."season",
        l."isActive",
        (l."id" = c."currentLeagueId") AS "isCurrent",
        COUNT(DISTINCT lst."teamId")::int AS "teamCount",
        COUNT(DISTINCT f."id")::int AS "fixtureCount"
      FROM "League" l
      LEFT JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
      LEFT JOIN "LeagueSeasonTeam" lst ON lst."leagueId" = l."id" AND lst."isActive" = true
      LEFT JOIN "Fixture" f ON f."leagueId" = l."id"
      WHERE l."competitionId" IS NOT NULL
      GROUP BY l."id", l."competitionId", l."name", l."slug", l."season", l."isActive", c."currentLeagueId"
      ORDER BY (l."id" = c."currentLeagueId") DESC, COALESCE(l."season", '') DESC, l."createdAt" DESC
    `),
    prisma.$queryRaw<SeasonRow[]>(Prisma.sql`
      SELECT
        l."id",
        l."competitionId",
        l."name",
        l."slug",
        l."season",
        l."isActive",
        false AS "isCurrent",
        COUNT(DISTINCT t."id")::int AS "teamCount",
        COUNT(DISTINCT f."id")::int AS "fixtureCount"
      FROM "League" l
      LEFT JOIN "Team" t ON t."leagueId" = l."id"
      LEFT JOIN "Fixture" f ON f."leagueId" = l."id"
      WHERE l."competitionId" IS NULL
      GROUP BY l."id", l."competitionId", l."name", l."slug", l."season", l."isActive"
      ORDER BY l."createdAt" DESC
    `),
  ]);

  const competitions = normaliseCompetitionRows(competitionRows);
  const seasons = normaliseSeasonRows(seasonRows);
  const ungroupedLeagues = normaliseSeasonRows(ungroupedRows);
  const seasonsByCompetition = new Map<string, SeasonRow[]>();

  for (const season of seasons) {
    if (!season.competitionId) continue;
    const existing = seasonsByCompetition.get(season.competitionId) ?? [];
    existing.push(season);
    seasonsByCompetition.set(season.competitionId, existing);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-white">Leagues</h1>
          <p className="text-sm text-white/60">
            Manage parent competitions and the seasons that sit underneath them.
          </p>
        </div>
        <Link
          href="/admin/leagues/homepage"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15"
        >
          Homepage leagues
        </Link>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Competitions</h2>
            <p className="mt-1 text-sm text-white/55">
              A competition is the ongoing league. Each competition can have Spring, Summer or future seasons inside it.
            </p>
          </div>
          <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
            {competitions.length} competition{competitions.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="space-y-4">
          {competitions.map((competition) => {
            const competitionSeasons = seasonsByCompetition.get(competition.id) ?? [];
            const currentSeason = competitionSeasons.find((season) => season.isCurrent) ?? null;

            return (
              <div key={competition.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-white">{competition.name}</h3>
                    <p className="mt-1 text-sm text-white/50">
                      Current season: {competition.currentSeason || currentSeason?.season || "Not set"} · {competition.seasonCount} season{competition.seasonCount === 1 ? "" : "s"} · {competition.teamCount} team{competition.teamCount === 1 ? "" : "s"}
                    </p>

                    <form action={updateCompetitionNameAction} className="mt-4 flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-end">
                      <input type="hidden" name="competitionId" value={competition.id} />
                      <label className="min-w-0 flex-1 text-xs font-medium text-white/55">
                        <span className="mb-1.5 block">Parent competition name</span>
                        <input
                          name="name"
                          defaultValue={competition.name}
                          required
                          maxLength={160}
                          className="min-h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400/50"
                        />
                      </label>
                      <button
                        type="submit"
                        className="min-h-10 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-emerald-100"
                      >
                        Save name
                      </button>
                    </form>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {currentSeason ? (
                      <Link
                        href={`/admin/leagues/${currentSeason.id}`}
                        className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                      >
                        Open current season
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {competitionSeasons.map((season) => (
                    <Link
                      key={season.id}
                      href={`/admin/leagues/${season.id}`}
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.06]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-white">
                            {season.season || "Unnamed season"}
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            {season.teamCount} team{season.teamCount === 1 ? "" : "s"} · {season.fixtureCount} fixture{season.fixtureCount === 1 ? "" : "s"}
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${season.isCurrent ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-100" : "border border-white/10 bg-white/[0.04] text-white/55"}`}>
                          {season.isCurrent ? "Current" : "Archive"}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}

          {competitions.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/50">
              No parent competitions yet. Ungrouped league seasons are shown below.
            </p>
          ) : null}
        </div>
      </div>

      {ungroupedLeagues.length > 0 ? (
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.05] p-6">
          <h2 className="mb-2 text-lg font-semibold text-white">Ungrouped league seasons</h2>
          <p className="mb-4 text-sm text-white/55">
            These league season records are not yet linked to a parent competition. Link them into a competition when they are part of an ongoing league such as Harrogate Tuesday.
          </p>
          <div className="space-y-3">
            {ungroupedLeagues.map((league) => (
              <Link
                key={league.id}
                href={`/admin/leagues/${league.id}`}
                className="block rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white/80 hover:bg-black/30 hover:text-white"
              >
                <span className="font-semibold">{league.name}</span>
                {league.season ? <span className="text-white/45"> · {league.season}</span> : null}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
        <h2 className="mb-2 text-lg font-semibold text-white">Create new league season</h2>
        <p className="mb-5 text-sm text-white/55">
          For existing competitions, use the competition season panel on the league page to create the next season. This form is mainly for creating a brand-new league setup. Brand-new league records default to Forming on the homepage and can be changed from Homepage leagues.
        </p>

        <LeagueForm
          mode="create"
          action={createLeagueAction}
          initialValues={{
            isActive: true,
            ctaText: "Register your team",
            format: "6-a-side",
          }}
        />
      </div>
    </div>
  );
}
