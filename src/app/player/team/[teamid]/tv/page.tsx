// ========================================
// File: src/app/player/team/[teamid]/tv/page.tsx
// ========================================

import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { Prisma, UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import SixflTvFixtureMatchup from "@/components/sixfl-tv/SixflTvFixtureMatchup";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Player SIXFL TV | SIXFL" };

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

function getVideoUrls(value: string | null | undefined) {
  return (value ?? "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getVideoLabel(index: number) {
  if (index === 0) return "Match highlights ▶";
  if (index === 1) return "Full match ▶";
  return `Extra clip ${index - 1} ▶`;
}

function SixflTvWordmark() {
  return (
    <div className="inline-flex items-center gap-3 rounded-2xl border border-fuchsia-300/20 bg-black/30 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.3)]">
      <span className="relative inline-flex h-9 w-12 items-center justify-center overflow-hidden rounded-lg bg-black text-xl font-black italic tracking-[-0.16em] text-white">
        <span className="absolute left-1 top-1/2 h-1 w-10 -translate-y-1/2 -rotate-[34deg] rounded-full bg-emerald-400" />
        <span className="relative pr-1">XFL</span>
      </span>
      <span className="text-lg font-black tracking-[0.24em] text-white">TV</span>
    </div>
  );
}

export default async function PlayerSixflTvPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/tv`)}`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      role: true,
      teamMembers: {
        where: { teamId: teamid },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!user || (user.role !== UserRole.ADMIN && user.teamMembers.length === 0)) {
    notFound();
  }

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
    <main className="bg-[#07130f] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-fuchsia-400/20 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.2),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <SixflTvWordmark />
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                {team.name} videos
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
                Watch match highlights, full matches and extra clips from your player dashboard.
              </p>
              <a
                href={`/player/team/${teamid}`}
                className="mt-5 inline-flex rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5"
              >
                Back to player dashboard
              </a>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 px-6 py-5 text-center lg:min-w-44">
              <div className="text-4xl font-black text-white">{fixtures.length}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-200/65">
                Recorded matches
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="divide-y divide-white/10">
            {fixtures.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/60">
                No match videos are available for your team yet.
              </div>
            ) : (
              fixtures.map((fixture) => {
                const urls = getVideoUrls(fixture.sixflTvUrl);
                const accessibleTitle =
                  fixture.homeScore !== null && fixture.awayScore !== null
                    ? `${fixture.homeTeamName} ${fixture.homeScore}-${fixture.awayScore} ${fixture.awayTeamName}`
                    : `${fixture.homeTeamName} versus ${fixture.awayTeamName}`;

                return (
                  <article key={fixture.id} className="px-5 py-5 sm:px-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <h2 className="sr-only">{accessibleTitle}</h2>
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
                        <p className="mt-3 text-sm text-white/50">
                          {formatDateTime(fixture.kickoffAt)} · {fixture.venueName ?? fixture.leagueVenueName ?? "Venue TBC"}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                        {urls.map((url, index) => (
                          <a
                            key={`${fixture.id}-${url}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-full border border-fuchsia-300/35 bg-fuchsia-500/15 px-5 py-3 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-500/25"
                          >
                            {getVideoLabel(index)}
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
    </main>
  );
}
