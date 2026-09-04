import Link from "next/link";
import { Prisma } from "@prisma/client";

import { createCupAction } from "./actions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type CupRow = {
  competitionId: string;
  name: string;
  slug: string;
  currentLeagueId: string | null;
  season: string | null;
  cupFormat: string | null;
  isInterLeague: boolean;
  teamCount: number;
  fixtureCount: number;
};

function formatCupFormat(value: string | null) {
  return value === "GROUPS_THEN_KNOCKOUT" ? "Groups + knockout" : "Knockout";
}

export default async function AdminCupsPage() {
  await requireAdmin();

  const rows = await prisma.$queryRaw<CupRow[]>(Prisma.sql`
    SELECT
      c."id" AS "competitionId",
      c."name",
      c."slug",
      c."currentLeagueId",
      l."season",
      c."cupFormat",
      c."isInterLeague",
      COUNT(DISTINCT lst."teamId")::int AS "teamCount",
      COUNT(DISTINCT f."id")::int AS "fixtureCount"
    FROM "LeagueCompetition" c
    LEFT JOIN "League" l ON l."id" = c."currentLeagueId"
    LEFT JOIN "LeagueSeasonTeam" lst
      ON lst."leagueId" = c."currentLeagueId"
     AND lst."isActive" = true
    LEFT JOIN "Fixture" f ON f."leagueId" = c."currentLeagueId"
    WHERE c."competitionType" = 'CUP'
    GROUP BY
      c."id",
      c."name",
      c."slug",
      c."currentLeagueId",
      l."season",
      c."cupFormat",
      c."isInterLeague"
    ORDER BY c."isActive" DESC, c."createdAt" DESC
  `);

  const cups = rows.map((row) => ({
    ...row,
    isInterLeague: Boolean(row.isInterLeague),
    teamCount: Number(row.teamCount ?? 0),
    fixtureCount: Number(row.fixtureCount ?? 0),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/70">
          Competitions
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-white">SIXFL Cups</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
          Cup competitions sit alongside normal leagues. A team stays in its existing league and can be entered into a cup at the same time without duplicating the team or its players.
        </p>
      </div>

      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-white">Create a cup</h2>
          <p className="mt-1 text-sm text-white/55">
            Start the competition first, then add entrants from any SIXFL league.
          </p>
        </div>

        <form action={createCupAction} className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-white/70">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Cup name</span>
            <input
              name="name"
              required
              defaultValue="SIXFL Inter-League Cup"
              maxLength={160}
              className="min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none focus:border-emerald-400/50"
            />
          </label>

          <label className="text-sm text-white/70">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Season</span>
            <input
              name="season"
              required
              defaultValue="2026/27"
              maxLength={80}
              className="min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none focus:border-emerald-400/50"
            />
          </label>

          <label className="text-sm text-white/70">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Format</span>
            <select
              name="cupFormat"
              defaultValue="KNOCKOUT"
              className="min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none focus:border-emerald-400/50"
            >
              <option value="KNOCKOUT">Straight knockout</option>
              <option value="GROUPS_THEN_KNOCKOUT">Groups then knockout</option>
            </select>
          </label>

          <label className="text-sm text-white/70">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Teams</span>
            <select
              name="leagueType"
              defaultValue="MENS"
              className="min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none focus:border-emerald-400/50"
            >
              <option value="MENS">Mens</option>
              <option value="WOMENS">Womens</option>
              <option value="YOUTH">Youth</option>
            </select>
          </label>

          <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
            <input
              type="checkbox"
              name="isInterLeague"
              defaultChecked
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black"
            />
            <span>
              <span className="block font-semibold text-white">Inter-league cup</span>
              <span className="mt-1 block text-xs leading-5 text-white/50">
                Teams can be selected from different SIXFL leagues while retaining their normal league membership.
              </span>
            </span>
          </label>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="min-h-11 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20"
            >
              Create cup competition
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Cup competitions</h2>
            <p className="mt-1 text-sm text-white/50">Manage entrants first. Draw and bracket tools can then sit on the same competition.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-white/60">
            {cups.length} cup{cups.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="space-y-3">
          {cups.map((cup) => (
            <div key={cup.competitionId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-white">{cup.name}</h3>
                    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                      {formatCupFormat(cup.cupFormat)}
                    </span>
                    {cup.isInterLeague ? (
                      <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-100">
                        Inter-league
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-white/50">
                    {cup.season || "No season"} · {cup.teamCount} entrant{cup.teamCount === 1 ? "" : "s"} · {cup.fixtureCount} fixture{cup.fixtureCount === 1 ? "" : "s"}
                  </p>
                </div>

                {cup.currentLeagueId ? (
                  <Link
                    href={`/admin/cups/${encodeURIComponent(cup.currentLeagueId)}`}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                  >
                    Manage cup
                  </Link>
                ) : (
                  <span className="text-xs text-amber-200/70">No current season set</span>
                )}
              </div>
            </div>
          ))}

          {cups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/50">
              No cup competitions yet. Create the first one above.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
