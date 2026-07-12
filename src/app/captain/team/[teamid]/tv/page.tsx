// ========================================
// File: src/app/captain/team/[teamid]/tv/page.tsx
// ========================================

import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Captain SIXFL TV | SIXFL" };

type TvFixtureRow = {
  id: string;
  kickoffAt: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  sixflTvUrl: string;
  venueName: string | null;
  leagueVenueName: string | null;
  status: string;
};

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFixtureTitle(row: TvFixtureRow) {
  if (row.homeScore !== null && row.awayScore !== null) {
    return `${row.homeTeamName} ${row.homeScore}-${row.awayScore} ${row.awayTeamName}`;
  }

  return `${row.homeTeamName} vs ${row.awayTeamName}`;
}

function getOpponent(row: TvFixtureRow, teamId: string) {
  return row.homeTeamId === teamId ? row.awayTeamName : row.homeTeamName;
}

export default async function CaptainSixflTvPage({ params }: { params: Promise<{ teamid: string }> }) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, name: true },
  });

  if (!team) notFound();

  const fixtures = await prisma.$queryRaw<TvFixtureRow[]>(Prisma.sql`
    SELECT
      f."id",
      f."kickoffAt",
      f."homeTeamId",
      f."awayTeamId",
      home."name" AS "homeTeamName",
      away."name" AS "awayTeamName",
      result."homeScore" AS "homeScore",
      result."awayScore" AS "awayScore",
      f."sixflTvUrl" AS "sixflTvUrl",
      venue."name" AS "venueName",
      league."venueName" AS "leagueVenueName",
      f."status"::text AS "status"
    FROM "Fixture" f
    JOIN "Team" home ON home."id" = f."homeTeamId"
    JOIN "Team" away ON away."id" = f."awayTeamId"
    JOIN "League" league ON league."id" = f."leagueId"
    LEFT JOIN "Venue" venue ON venue."id" = f."venueId"
    LEFT JOIN "MatchResult" result ON result."fixtureId" = f."id"
    WHERE f."publishedAt" IS NOT NULL
      AND f."sixflTvRecorded" = true
      AND f."sixflTvUrl" IS NOT NULL
      AND f."sixflTvUrl" <> ''
      AND (f."homeTeamId" = ${teamid} OR f."awayTeamId" = ${teamid})
    ORDER BY f."kickoffAt" DESC
    LIMIT 80
  `);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-fuchsia-400/20 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="px-6 py-6 lg:px-8 lg:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-fuchsia-200/80">SIXFL TV</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Match videos & clips</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
            Open saved Veo/SIXFL TV links for {team.name}. Full matches and timestamped clips appear here once SIXFL has saved a link against the fixture.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Past and saved fixtures</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Available videos</h2>
            </div>
            <span className="rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-1 text-sm font-medium text-fuchsia-100">
              {fixtures.length} link{fixtures.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="divide-y divide-white/10">
          {fixtures.length === 0 ? (
            <div className="px-6 py-10 text-sm leading-6 text-white/60">
              No SIXFL TV links have been saved for this team yet. Add a Veo link from the admin Night Board and it will appear here for the captain.
            </div>
          ) : (
            fixtures.map((fixture) => (
              <article key={fixture.id} className="px-6 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{getFixtureTitle(fixture)}</h3>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">
                        {fixture.status.toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-white/60">Opponent: {getOpponent(fixture, team.id)}</p>
                    <p className="mt-1 text-sm text-white/50">
                      {formatDateTime(fixture.kickoffAt)} · {fixture.venueName ?? fixture.leagueVenueName ?? "Venue TBC"}
                    </p>
                  </div>

                  <a
                    href={fixture.sixflTvUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-fuchsia-300/35 bg-fuchsia-500/15 px-5 py-3 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-500/25"
                  >
                    Watch SIXFL TV ▶
                  </a>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
