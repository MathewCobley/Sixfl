// ========================================
// File: src/app/(public)/leagues/[slug]/fixtures/page.tsx
// ========================================

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import TeamShirt from "@/components/fixtures/TeamShirt";
import { getFallbackFixtureAiPreview, type FixtureAiPreview } from "@/lib/fixtures/aiPredictor";
import { getStoredAiPreviewsByFixtureIds } from "@/lib/fixtures/storedAiPredictions";
import { calculateFixtureWinChance } from "@/lib/fixtures/winChance";
import { prisma } from "@/lib/prisma";
import { getTeamKitColours } from "@/lib/teams/kit-colours";

function formatKickoffTime(value: Date | null) {
  if (!value) return "TBC";

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function formatKickoffDate(value: Date | null) {
  if (!value) return "Date TBC";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function normaliseLogoUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  return `/${trimmed}`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "?";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
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

type WinChanceWithAi = ReturnType<typeof calculateFixtureWinChance> & {
  aiPreview?: FixtureAiPreview;
};

type FixtureForPrediction = {
  divisionId: string | null;
};

function getPredictionFixturePool<TFixture extends FixtureForPrediction>(
  _fixture: TFixture,
  fixtures: TFixture[],
) {
  return fixtures;
}

function TeamBadge({
  name,
  logoUrl,
  kitColour,
  align = "left",
}: {
  name: string;
  logoUrl: string | null;
  kitColour: string | null;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-4 ${
        align === "right" ? "justify-end text-right md:flex-row-reverse" : ""
      }`}
    >
      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_18px_38px_rgba(0,0,0,0.32)] sm:h-24 sm:w-24">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={`${name} badge`}
            fill
            sizes="96px"
            className="object-contain p-2"
            unoptimized
          />
        ) : (
          <span className="text-2xl font-black text-white/60">
            {getInitials(name)}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
          {align === "right" ? "Away" : "Home"}
        </div>
        <div
          className={`mt-1 flex items-center gap-2 text-lg font-black leading-tight text-white sm:text-2xl ${
            align === "right" ? "justify-end" : ""
          }`}
        >
          <TeamShirt colour={kitColour} teamName={name} size="md" />
          <span>{name}</span>
        </div>
      </div>
    </div>
  );
}

function WinChanceBlock({
  homeTeamName,
  awayTeamName,
  chance,
}: {
  homeTeamName: string;
  awayTeamName: string;
  chance: WinChanceWithAi;
}) {
  const rows = [
    { key: "home" as const, label: homeTeamName, shortLabel: "Home", value: chance.home },
    { key: "draw" as const, label: "Draw", shortLabel: "Draw", value: chance.draw },
    { key: "away" as const, label: awayTeamName, shortLabel: "Away", value: chance.away },
  ];

  return (
    <div className="mt-5 rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.06] p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            SIXFL AI Predictor
          </div>
          <div className="mt-1 text-xs text-white/45">
            Match preview · {chance.confidence} confidence · Just for fun
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-black/25 px-5 py-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70">
            Predicted result
          </div>
          <div className="mt-1 text-3xl font-black text-white">
            {chance.predictedResult.label}
          </div>
        </div>
      </div>

      {chance.aiPreview ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-semibold text-white">
            {chance.aiPreview.headline}
          </div>
          <p className="mt-2 text-sm leading-6 text-white/60">
            {chance.aiPreview.summary}
          </p>
        </div>
      ) : null}

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

  const kitColours = await getTeamKitColours(
    league.fixtures.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]),
  );

  const scheduledFixtures = league.fixtures.filter((fixture) => fixture.status === "SCHEDULED");
  const storedPreviews = await getStoredAiPreviewsByFixtureIds(
    scheduledFixtures.map((fixture) => fixture.id),
  );

  const winChanceEntries = scheduledFixtures.map((fixture) => {
    const predictionFixtures = getPredictionFixturePool(fixture, league.fixtures);
    const winChance = calculateFixtureWinChance({
      homeTeamId: fixture.homeTeam.id,
      awayTeamId: fixture.awayTeam.id,
      fixtures: predictionFixtures,
    });
    const aiPreview =
      storedPreviews.get(fixture.id) ??
      getFallbackFixtureAiPreview({
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
        winChance,
      });

    return [fixture.id, { ...winChance, aiPreview }] as const;
  });
  const winChanceByFixtureId = new Map<string, WinChanceWithAi>(winChanceEntries);

  const rounds = league.fixtures.reduce(
    (acc, fixture) => {
      const roundKey = fixture.round ?? 0;
      if (!acc[roundKey]) acc[roundKey] = [];
      acc[roundKey].push(fixture);
      return acc;
    },
    {} as Record<number, typeof league.fixtures>,
  );

  const sortedRounds = Object.entries(rounds).sort(
    ([roundA], [roundB]) => Number(roundB) - Number(roundA),
  );

  const scheduledCount = league.fixtures.filter(
    (fixture) => fixture.status === "SCHEDULED",
  ).length;
  const completedCount = league.fixtures.filter(
    (fixture) => fixture.status === "COMPLETED",
  ).length;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
          <div className="px-5 py-7 sm:px-8 lg:px-10">
            <Link
              href={`/leagues/${league.slug}`}
              className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
            >
              ← Back to league
            </Link>

            <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                  Fixtures
                </p>
                <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                  {league.name}
                </h1>
                <p className="mt-3 text-sm leading-6 text-white/60 sm:text-base">
                  Published fixtures with team badges, shirt colours, kick-off details and the SIXFL AI Predictor.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center sm:min-w-[22rem]">
                <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                  <div className="text-2xl font-black text-white">{league.fixtures.length}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Total</div>
                </div>
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                  <div className="text-2xl font-black text-white">{scheduledCount}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/60">Upcoming</div>
                </div>
                <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3">
                  <div className="text-2xl font-black text-white">{completedCount}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100/60">Played</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {sortedRounds.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-white/65">
            Fixtures will appear here once they have been published.
          </div>
        ) : null}

        {sortedRounds.map(([round, fixtures]) => (
          <section key={round} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-lg font-black text-emerald-100">
                {round}
              </div>
              <div>
                <h2 className="text-xl font-black text-white sm:text-2xl">Week {round}</h2>
                <p className="text-sm text-white/45">
                  {fixtures.length} fixture{fixtures.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {fixtures.map((fixture) => {
                const homeLogoUrl = normaliseLogoUrl(fixture.homeTeam.logoUrl);
                const awayLogoUrl = normaliseLogoUrl(fixture.awayTeam.logoUrl);
                const winChance = winChanceByFixtureId.get(fixture.id) ?? null;

                return (
                  <article
                    key={fixture.id}
                    className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
                  >
                    <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:p-7">
                      <TeamBadge
                        name={fixture.homeTeam.name}
                        logoUrl={homeLogoUrl}
                        kitColour={kitColours.get(fixture.homeTeamId) ?? null}
                      />

                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        {fixture.result ? (
                          <div className="inline-flex min-w-[120px] items-center justify-center rounded-3xl border border-white/10 bg-white/[0.06] px-5 py-3 text-3xl font-black text-white shadow-inner shadow-black/20">
                            {fixture.result.homeScore} - {fixture.result.awayScore}
                          </div>
                        ) : (
                          <div className="inline-flex min-w-[86px] items-center justify-center rounded-3xl border border-white/10 bg-black/35 px-5 py-3 text-sm font-black uppercase tracking-[0.22em] text-white/45">
                            VS
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium">
                          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-white/65">
                            {formatKickoffDate(fixture.kickoffAt)}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-white/65">
                            {formatKickoffTime(fixture.kickoffAt)}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-white/65">
                            {fixture.pitch ?? "Pitch TBC"}
                          </span>
                        </div>
                      </div>

                      <TeamBadge
                        name={fixture.awayTeam.name}
                        logoUrl={awayLogoUrl}
                        kitColour={kitColours.get(fixture.awayTeamId) ?? null}
                        align="right"
                      />
                    </div>

                    {winChance ? (
                      <div className="border-t border-white/10 px-5 pb-5 sm:px-6 sm:pb-6 lg:px-7 lg:pb-7">
                        <WinChanceBlock
                          homeTeamName={fixture.homeTeam.name}
                          awayTeamName={fixture.awayTeam.name}
                          chance={winChance}
                        />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
