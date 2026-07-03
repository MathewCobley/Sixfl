// ========================================
// File: src/app/(admin)/admin/fixtures/all/page.tsx
// ========================================

import Link from "next/link";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type AllFixtureRow = {
  id: string;
  kickoffAt: Date;
  status: string;
  publishedAt: Date | null;
  round: number | null;
  position: number | null;
  pitch: string | null;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  divisionId: string | null;
  divisionName: string | null;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  venueName: string | null;
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

function statusClasses(status: string) {
  switch (status) {
    case "SCHEDULED":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    case "COMPLETED":
      return "border-sky-400/20 bg-sky-500/10 text-sky-100";
    case "POSTPONED":
      return "border-amber-400/20 bg-amber-500/10 text-amber-100";
    case "CANCELLED":
      return "border-red-400/20 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

export default async function AllAdminFixturesPage({ searchParams }: PageProps) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const rawQuery = getSearchParamValue(sp.q)?.trim() || "Northallerton";
  const query = rawQuery.trim();
  const searchPattern = `%${query.toLowerCase()}%`;

  const fixtures = await prisma.$queryRaw<AllFixtureRow[]>(Prisma.sql`
    SELECT
      f."id",
      f."kickoffAt",
      f."status",
      f."publishedAt",
      f."round",
      f."position",
      f."pitch",
      l."id" AS "leagueId",
      l."name" AS "leagueName",
      l."season" AS "leagueSeason",
      d."id" AS "divisionId",
      d."name" AS "divisionName",
      ht."id" AS "homeTeamId",
      ht."name" AS "homeTeamName",
      at."id" AS "awayTeamId",
      at."name" AS "awayTeamName",
      v."name" AS "venueName"
    FROM "Fixture" f
    JOIN "League" l ON l."id" = f."leagueId"
    JOIN "Team" ht ON ht."id" = f."homeTeamId"
    JOIN "Team" at ON at."id" = f."awayTeamId"
    LEFT JOIN "LeagueDivision" d ON d."id" = f."divisionId"
    LEFT JOIN "Venue" v ON v."id" = f."venueId"
    WHERE (
      ${query} = ''
      OR LOWER(l."name") LIKE ${searchPattern}
      OR LOWER(COALESCE(l."season", '')) LIKE ${searchPattern}
      OR LOWER(COALESCE(d."name", '')) LIKE ${searchPattern}
      OR LOWER(ht."name") LIKE ${searchPattern}
      OR LOWER(at."name") LIKE ${searchPattern}
      OR LOWER(COALESCE(v."name", '')) LIKE ${searchPattern}
    )
    ORDER BY f."kickoffAt" ASC, f."round" ASC NULLS LAST, f."position" ASC NULLS LAST
    LIMIT 500
  `);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/admin/fixtures" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
            ← Back to fixtures console
          </Link>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Admin emergency view
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            All fixtures
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
            This page reads directly from the Fixture table. It does not use current-season filters, division defaults, the matchup grid, or client-side DOM filtering.
          </p>
        </div>

        <form className="flex w-full max-w-xl gap-3" action="/admin/fixtures/all">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search league, division, team or venue"
            className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
          />
          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300">
            Search
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Search</div>
          <div className="mt-1 text-lg font-semibold text-white">{query || "All"}</div>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/60">Fixtures found</div>
          <div className="mt-1 text-lg font-semibold text-white">{fixtures.length}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Limit</div>
          <div className="mt-1 text-lg font-semibold text-white">500</div>
        </div>
      </div>

      {fixtures.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-white/65">
          No fixtures matched “{query}”. Try searching a team name, venue name, league name, or clear the search box.
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.04] text-[11px] uppercase tracking-[0.16em] text-white/40">
                  <th className="px-5 py-4 font-semibold">Fixture</th>
                  <th className="px-5 py-4 font-semibold">League / division</th>
                  <th className="px-5 py-4 font-semibold">Kickoff</th>
                  <th className="px-5 py-4 font-semibold">Venue</th>
                  <th className="px-5 py-4 font-semibold">Week</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">IDs</th>
                </tr>
              </thead>
              <tbody>
                {fixtures.map((fixture) => (
                  <tr key={fixture.id} className="border-b border-white/5 align-top last:border-b-0 hover:bg-white/[0.025]">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white">{fixture.homeTeamName} vs {fixture.awayTeamName}</div>
                      <div className="mt-1 text-xs text-white/45">{fixture.pitch || "Pitch not set"}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-white/80">{fixture.leagueName}</div>
                      <div className="mt-1 text-xs text-white/45">{fixture.leagueSeason || "No season"} · {fixture.divisionName || "No division"}</div>
                    </td>
                    <td className="px-5 py-4 text-white/70">{formatDateTime(fixture.kickoffAt)}</td>
                    <td className="px-5 py-4 text-white/70">{fixture.venueName || "No venue"}</td>
                    <td className="px-5 py-4 text-white/70">
                      Week {fixture.round ?? "—"}
                      {fixture.position !== null ? <div className="text-xs text-white/40">Game {fixture.position}</div> : null}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(fixture.status)}`}>
                          {fixture.status}
                        </span>
                        <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${fixture.publishedAt ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>
                          {fixture.publishedAt ? "Live on site" : "Draft only"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-white/40">
                      <div>Fixture: {fixture.id}</div>
                      <div>League: {fixture.leagueId}</div>
                      <div>Division: {fixture.divisionId || "null"}</div>
                      <div>Home: {fixture.homeTeamId}</div>
                      <div>Away: {fixture.awayTeamId}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
