// ========================================
// File: src/app/captain/team/[teamid]/tv/page.tsx
// ========================================

import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import CaptainPwaModeOnly from "@/components/captain/CaptainPwaModeOnly";
import SixflTvFixtureMatchup from "@/components/sixfl-tv/SixflTvFixtureMatchup";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getSixflTvVideos } from "@/lib/sixfl-tv/videos";

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
  homeTeamLogoUrl: string | null;
  awayTeamLogoUrl: string | null;
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

export default async function CaptainSixflTvPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
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
      home."logoUrl" AS "homeTeamLogoUrl",
      away."logoUrl" AS "awayTeamLogoUrl",
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
    <main className="text-white">
      <CaptainPwaModeOnly mode="app">
        <div className="px-4 pb-28 pt-5">
          <div className="mx-auto w-full max-w-xl">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-300/70">
                Captain app
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">SIXFL TV</h1>
              <p className="mt-2 text-sm leading-6 text-white/45">
                Highlights and recorded matches for {team.name}.
              </p>
            </div>

            <section className="mt-5 space-y-3">
              {fixtures.length === 0 ? (
                <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-5 text-sm text-white/50">
                  No match videos are available for your team yet.
                </div>
              ) : (
                fixtures.map((fixture) => {
                  const videos = getSixflTvVideos(fixture.sixflTvUrl);
                  return (
                    <article
                      key={fixture.id}
                      className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4"
                    >
                      <SixflTvFixtureMatchup
                        homeTeam={{
                          name: fixture.homeTeamName,
                          logoUrl: fixture.homeTeamLogoUrl,
                        }}
                        awayTeam={{
                          name: fixture.awayTeamName,
                          logoUrl: fixture.awayTeamLogoUrl,
                        }}
                        homeScore={fixture.homeScore}
                        awayScore={fixture.awayScore}
                      />
                      <p className="mt-3 text-center text-[11px] leading-5 text-white/40">
                        {formatDateTime(fixture.kickoffAt)} · {fixture.venueName ?? fixture.leagueVenueName ?? "Venue TBC"}
                      </p>
                      <div className="mt-3 grid gap-2">
                        {videos.map((video) => (
                          <a
                            key={`${fixture.id}-${video.kind}-${video.url}`}
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-h-11 items-center justify-center rounded-xl border border-fuchsia-300/25 bg-fuchsia-500/12 px-4 text-sm font-bold text-fuchsia-50 active:bg-fuchsia-500/20"
                          >
                            {video.label} ▶
                          </a>
                        ))}
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          </div>
        </div>
      </CaptainPwaModeOnly>

      <CaptainPwaModeOnly mode="web">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-3xl border border-fuchsia-400/20 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <div className="px-6 py-6 lg:px-8 lg:py-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/Sixfl-tv.png"
                alt="SIXFL TV"
                className="h-auto w-52 max-w-full object-contain sm:w-64"
              />
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Match highlights & full matches
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
                Watch match highlights, full matches and extra clips for {team.name}. When a video is available, it will appear below.
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
            <div className="divide-y divide-white/10">
              {fixtures.length === 0 ? (
                <div className="px-6 py-10 text-sm leading-6 text-white/60">
                  No match videos are available for your team yet.
                </div>
              ) : (
                fixtures.map((fixture) => {
                  const videos = getSixflTvVideos(fixture.sixflTvUrl);
                  return (
                    <article key={fixture.id} className="px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <SixflTvFixtureMatchup
                            homeTeam={{ name: fixture.homeTeamName, logoUrl: fixture.homeTeamLogoUrl }}
                            awayTeam={{ name: fixture.awayTeamName, logoUrl: fixture.awayTeamLogoUrl }}
                            homeScore={fixture.homeScore}
                            awayScore={fixture.awayScore}
                          />
                          <p className="mt-3 text-sm text-white/50">
                            {formatDateTime(fixture.kickoffAt)} · {fixture.venueName ?? fixture.leagueVenueName ?? "Venue TBC"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                          {videos.map((video) => (
                            <a
                              key={`${fixture.id}-${video.kind}-${video.url}`}
                              href={video.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-full border border-fuchsia-300/35 bg-fuchsia-500/15 px-5 py-3 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-500/25"
                            >
                              {video.label} ▶
                            </a>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </CaptainPwaModeOnly>
    </main>
  );
}
