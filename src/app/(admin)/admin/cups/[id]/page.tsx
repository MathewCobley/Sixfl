import Link from "next/link";
import { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";

import TeamBadge from "@/components/admin/TeamBadge";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";
import { addCupEntrantAction, removeCupEntrantAction } from "./actions";

type Props = {
  params: Promise<{ id: string }>;
};

type CupRow = {
  leagueId: string;
  competitionId: string;
  name: string;
  season: string | null;
  cupFormat: string | null;
  isInterLeague: boolean;
  fixtureCount: number;
};

type TeamRow = {
  id: string;
  name: string;
  logoUrl: string | null;
  sourceLeagueId: string | null;
  sourceLeagueName: string | null;
};

function formatCupFormat(value: string | null) {
  return value === "GROUPS_THEN_KNOCKOUT" ? "Groups + knockout" : "Straight knockout";
}

export default async function AdminCupPage({ params }: Props) {
  await requireAdmin();
  const { id: leagueId } = await params;

  const cupRows = await prisma.$queryRaw<CupRow[]>(Prisma.sql`
    SELECT
      l."id" AS "leagueId",
      c."id" AS "competitionId",
      c."name",
      l."season",
      c."cupFormat",
      c."isInterLeague",
      COUNT(DISTINCT f."id")::int AS "fixtureCount"
    FROM "League" l
    INNER JOIN "LeagueCompetition" c ON c."id" = l."competitionId"
    LEFT JOIN "Fixture" f ON f."leagueId" = l."id"
    WHERE l."id" = ${leagueId}
      AND c."competitionType" = 'CUP'
    GROUP BY l."id", c."id", c."name", l."season", c."cupFormat", c."isInterLeague"
    LIMIT 1
  `);

  const cup = cupRows[0];
  if (!cup) notFound();

  const [entrantRows, candidateRows] = await Promise.all([
    prisma.$queryRaw<TeamRow[]>(Prisma.sql`
      SELECT
        t."id",
        t."name",
        t."logoUrl",
        source_l."id" AS "sourceLeagueId",
        source_l."name" AS "sourceLeagueName"
      FROM "LeagueSeasonTeam" cup_entry
      INNER JOIN "Team" t ON t."id" = cup_entry."teamId"
      LEFT JOIN LATERAL (
        SELECT l2."id", l2."name"
        FROM "LeagueSeasonTeam" source_entry
        INNER JOIN "League" l2 ON l2."id" = source_entry."leagueId"
        LEFT JOIN "LeagueCompetition" c2 ON c2."id" = l2."competitionId"
        WHERE source_entry."teamId" = t."id"
          AND source_entry."isActive" = true
          AND source_entry."leagueId" <> ${leagueId}
          AND COALESCE(c2."competitionType", 'LEAGUE') = 'LEAGUE'
        ORDER BY (l2."id" = t."leagueId") DESC, l2."createdAt" DESC
        LIMIT 1
      ) source_l ON true
      WHERE cup_entry."leagueId" = ${leagueId}
        AND cup_entry."isActive" = true
      ORDER BY COALESCE(source_l."name", ''), t."name"
    `),
    prisma.$queryRaw<TeamRow[]>(Prisma.sql`
      SELECT
        t."id",
        t."name",
        t."logoUrl",
        source_l."id" AS "sourceLeagueId",
        source_l."name" AS "sourceLeagueName"
      FROM "Team" t
      LEFT JOIN LATERAL (
        SELECT l2."id", l2."name"
        FROM "LeagueSeasonTeam" source_entry
        INNER JOIN "League" l2 ON l2."id" = source_entry."leagueId"
        LEFT JOIN "LeagueCompetition" c2 ON c2."id" = l2."competitionId"
        WHERE source_entry."teamId" = t."id"
          AND source_entry."isActive" = true
          AND source_entry."leagueId" <> ${leagueId}
          AND COALESCE(c2."competitionType", 'LEAGUE') = 'LEAGUE'
        ORDER BY (l2."id" = t."leagueId") DESC, l2."createdAt" DESC
        LIMIT 1
      ) source_l ON true
      WHERE NOT EXISTS (
        SELECT 1
        FROM "LeagueSeasonTeam" existing
        WHERE existing."leagueId" = ${leagueId}
          AND existing."teamId" = t."id"
          AND existing."isActive" = true
      )
        AND (
          source_l."id" IS NOT NULL
          OR t."leagueId" IS NOT NULL
        )
      ORDER BY COALESCE(source_l."name", ''), t."name"
    `),
  ]);

  const placeholderIds = await getFixturePlaceholderTeamIds(candidateRows.map((team) => team.id));
  const availableTeams = candidateRows.filter((team) => !placeholderIds.has(team.id));
  const entrants = entrantRows;
  const entrantsByLeague = new Map<string, TeamRow[]>();

  for (const entrant of entrants) {
    const leagueName = entrant.sourceLeagueName || "League not identified";
    const existing = entrantsByLeague.get(leagueName) ?? [];
    existing.push(entrant);
    entrantsByLeague.set(leagueName, existing);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link href="/admin/cups" className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300/70 hover:text-emerald-200">
            ← Cups
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-white">{cup.name}</h1>
          <p className="mt-2 text-sm text-white/55">
            {cup.season || "No season"} · {formatCupFormat(cup.cupFormat)} · {cup.isInterLeague ? "Inter-league" : "Cup"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/leagues/${encodeURIComponent(cup.leagueId)}`}
            className="inline-flex min-h-10 items-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]"
          >
            Competition settings
          </Link>
          <Link
            href="/admin/fixtures"
            className="inline-flex min-h-10 items-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15"
          >
            Fixtures
          </Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-xs uppercase tracking-[0.15em] text-white/40">Entrants</div>
          <div className="mt-2 text-2xl font-semibold text-white">{entrants.length}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-xs uppercase tracking-[0.15em] text-white/40">Source leagues</div>
          <div className="mt-2 text-2xl font-semibold text-white">{entrantsByLeague.size}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-xs uppercase tracking-[0.15em] text-white/40">Cup fixtures</div>
          <div className="mt-2 text-2xl font-semibold text-white">{Number(cup.fixtureCount ?? 0)}</div>
        </div>
      </section>

      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.05] p-6">
        <h2 className="text-lg font-semibold text-white">Add an entrant</h2>
        <p className="mt-1 text-sm text-white/55">
          This creates a second competition membership only. It does not change the team&apos;s normal league.
        </p>

        <form action={addCupEntrantAction} className="mt-5 flex flex-col gap-3 md:flex-row md:items-end">
          <input type="hidden" name="leagueId" value={cup.leagueId} />
          <label className="min-w-0 flex-1 text-sm text-white/70">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Team</span>
            <select
              name="teamId"
              required
              defaultValue=""
              className="min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none focus:border-emerald-400/50"
            >
              <option value="" disabled>Choose a team…</option>
              {availableTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.sourceLeagueName ? `${team.sourceLeagueName} — ` : ""}{team.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={availableTeams.length === 0}
            className="min-h-11 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add to cup
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-white">Cup entrants</h2>
          <p className="mt-1 text-sm text-white/50">
            Teams are grouped below by their normal SIXFL league. Once the draw exists, entrants with fixtures cannot be removed accidentally.
          </p>
        </div>

        <div className="space-y-5">
          {Array.from(entrantsByLeague.entries()).map(([leagueName, teams]) => (
            <div key={leagueName} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold text-white">{leagueName}</h3>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/55">
                  {teams.length} team{teams.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {teams.map((team) => (
                  <div key={team.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <TeamBadge name={team.name} logoUrl={team.logoUrl} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white">{team.name}</div>
                        <div className="truncate text-xs text-white/45">{team.sourceLeagueName || "Source league not identified"}</div>
                      </div>
                    </div>

                    <form action={removeCupEntrantAction}>
                      <input type="hidden" name="leagueId" value={cup.leagueId} />
                      <input type="hidden" name="teamId" value={team.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/15"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {entrants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/50">
              No teams have been entered yet. Add teams above from any SIXFL league.
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-amber-300/15 bg-amber-400/[0.04] p-6">
        <h2 className="text-lg font-semibold text-white">Next: draw and bracket</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          The competition and multi-league entrant structure are now separate from normal league membership. The next stage is to generate cup rounds using the existing fixture engine, then display those fixtures as a knockout bracket or group stage.
        </p>
      </section>
    </div>
  );
}
