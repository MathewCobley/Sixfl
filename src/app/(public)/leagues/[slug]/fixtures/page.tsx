// ========================================
// File: src/app/(public)/leagues/[slug]/fixtures/page.tsx
// ========================================

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calculateFixtureWinChance } from "@/lib/fixtures/winChance";

function formatKickoffTime(value: Date | null) {
  if (!value) {
    return "TBC";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function getWinChanceBarClasses(type: "home" | "draw" | "away") {
  switch (type) {
    case "home":
      return "bg-emerald-400";
    case "away":
      return "bg-sky-400";
    default:
      return "bg-white/45";
  }
}

function WinChanceBlock({
  homeTeamName,
  awayTeamName,
  chance,
}: {
  homeTeamName: string;
  awayTeamName: string;
  chance: ReturnType<typeof calculateFixtureWinChance>;
}) {
  const rows = [
    {
      key: "home" as const,
      label: homeTeamName,
      shortLabel: "Home",
      value: chance.home,
    },
    {
      key: "draw" as const,
      label: "Draw",
      shortLabel: "Draw",
      value: chance.draw,
    },
    {
      key: "away" as const,
      label: awayTeamName,
      shortLabel: "Away",
      value: chance.away,
    },
  ];

  return (
    <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Win chance
          </div>
          <div className="mt-1 text-xs text-white/45">
            Form-based prediction · {chance.confidence} confidence
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.key} className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-white/80" title={row.label}>
                  {row.shortLabel}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-white/40" title={row.label}>
                  {row.label}
                </div>
              </div>
              <div className="text-lg font-black text-white">{row.value}%</div>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${getWinChanceBarClasses(row.key)}`}
                style={{ width: `${row.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs leading-5 text-white/45">
        {chance.explanation}
      </p>
    </div>
  );
}

export default async function LeagueFixturesPublic({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const league = await prisma.league.findUnique({
    where: { slug },
    include: {
      fixtures: {
        where: {
          publishedAt: {
            not: null,
          },
        },
        orderBy: [{ round: "asc" }, { position: "asc" }, { kickoffAt: "asc" }],
        include: {
          homeTeam: true,
          awayTeam: true,
          result: {
            select: {
              homeScore: true,
              awayScore: true,
            },
          },
        },
      },
    },
  });

  if (!league) {
    notFound();
  }

  const rounds = league.fixtures.reduce(
    (acc, fixture) => {
      const roundKey = fixture.round ?? 0;

      if (!acc[roundKey]) {
        acc[roundKey] = [];
      }

      acc[roundKey].push(fixture);
      return acc;
    },
    {} as Record<number, typeof league.fixtures>,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-10">
      <h1 className="text-3xl font-semibold text-white">{league.name} Fixtures</h1>

      {Object.keys(rounds).length === 0 ? (
        <div className="rounded-xl bg-white/5 px-4 py-6 text-white/65">
          Fixtures will appear here once they have been published.
        </div>
      ) : null}

      {Object.entries(rounds).map(([round, fixtures]) => (
        <div key={round} className="space-y-3">
          <h2 className="text-lg font-medium text-white">Week {round}</h2>

          {fixtures.map((fixture) => {
            const winChance =
              fixture.status === "SCHEDULED"
                ? calculateFixtureWinChance({
                    homeTeamId: fixture.homeTeam.id,
                    awayTeamId: fixture.awayTeam.id,
                    fixtures: league.fixtures,
                  })
                : null;

            return (
              <div
                key={fixture.id}
                className="rounded-xl bg-white/5 px-4 py-4 text-white/80"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium">
                    {fixture.homeTeam.name} vs {fixture.awayTeam.name}
                  </span>

                  <span className="text-sm text-white/50">
                    {fixture.pitch ?? "Pitch TBC"} · {formatKickoffTime(fixture.kickoffAt)}
                  </span>
                </div>

                {winChance ? (
                  <WinChanceBlock
                    homeTeamName={fixture.homeTeam.name}
                    awayTeamName={fixture.awayTeam.name}
                    chance={winChance}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
