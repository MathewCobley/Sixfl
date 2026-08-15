import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FixtureStatus } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "League Results | SIXFL",
};

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

function formatResultDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatResultTime(value: Date) {
  return formatDateTimeInLondon(value, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TeamBadge({
  id,
  name,
  logoUrl,
  align = "left",
}: {
  id: string;
  name: string;
  logoUrl: string | null;
  align?: "left" | "right";
}) {
  const logo = normaliseLogoUrl(logoUrl);

  return (
    <Link
      href={`/teams/${id}`}
      className={`flex min-w-0 items-center gap-3 rounded-2xl transition hover:text-emerald-200 ${
        align === "right" ? "justify-end text-right md:flex-row-reverse" : ""
      }`}
    >
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:h-16 sm:w-16">
        {logo ? (
          <Image
            src={logo}
            alt={`${name} badge`}
            fill
            sizes="64px"
            className="object-contain p-1.5"
            unoptimized
          />
        ) : (
          <span className="text-sm font-black text-white/60">{getInitials(name)}</span>
        )}
      </div>
      <span className="min-w-0 text-sm font-semibold leading-5 text-white sm:text-base">
        {name}
      </span>
    </Link>
  );
}

export default async function LeagueResultsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const league = await prisma.league.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      season: true,
      venueName: true,
      area: true,
      fixtures: {
        where: {
          publishedAt: { not: null },
          status: FixtureStatus.COMPLETED,
        },
        orderBy: [{ kickoffAt: "desc" }, { round: "desc" }, { position: "desc" }],
        select: {
          id: true,
          kickoffAt: true,
          round: true,
          pitch: true,
          homeTeam: {
            select: { id: true, name: true, logoUrl: true },
          },
          awayTeam: {
            select: { id: true, name: true, logoUrl: true },
          },
          result: {
            select: {
              homeScore: true,
              awayScore: true,
              isDisputed: true,
            },
          },
        },
      },
    },
  });

  if (!league) notFound();

  const results = league.fixtures.filter(
    (fixture): fixture is typeof fixture & { result: NonNullable<typeof fixture.result> } =>
      Boolean(fixture.result),
  );

  const groups = new Map<
    string,
    {
      label: string;
      fixtures: typeof results;
    }
  >();

  for (const fixture of results) {
    const key = fixture.round ? `round-${fixture.round}` : `date-${fixture.kickoffAt.toISOString().slice(0, 10)}`;
    const label = fixture.round ? `Week ${fixture.round}` : formatResultDate(fixture.kickoffAt);
    const group = groups.get(key) ?? { label, fixtures: [] };
    group.fixtures.push(fixture);
    groups.set(key, group);
  }

  const groupedResults = Array.from(groups.values());
  const totalGoals = results.reduce(
    (sum, fixture) => sum + fixture.result.homeScore + fixture.result.awayScore,
    0,
  );
  const latestResult = results[0] ?? null;
  const venueLabel = league.venueName || league.area || "SIXFL";

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
                  Results
                </p>
                <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                  {league.name}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
                  Every published completed result from {league.season ? `${league.season} at ` : ""}{venueLabel}, newest first.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center sm:min-w-[24rem]">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                  <div className="text-2xl font-black text-white">{results.length}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/60">Played</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                  <div className="text-2xl font-black text-white">{totalGoals}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Goals</div>
                </div>
                <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3">
                  <div className="text-sm font-black text-white sm:text-base">
                    {latestResult ? formatResultDate(latestResult.kickoffAt) : "—"}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100/60">Latest</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {groupedResults.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center">
            <h2 className="text-xl font-semibold text-white">No completed results yet</h2>
            <p className="mt-2 text-sm text-white/55">
              Results will appear here as soon as completed published fixtures have scores recorded.
            </p>
          </div>
        ) : null}

        {groupedResults.map((group) => (
          <section key={group.label} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 min-w-12 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 text-sm font-black text-emerald-100">
                {group.label.replace("Week ", "W")}
              </div>
              <div>
                <h2 className="text-xl font-black text-white sm:text-2xl">{group.label}</h2>
                <p className="text-sm text-white/45">
                  {group.fixtures.length} result{group.fixtures.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {group.fixtures.map((fixture) => (
                <article
                  key={fixture.id}
                  className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))]"
                >
                  <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center sm:p-6">
                    <TeamBadge
                      id={fixture.homeTeam.id}
                      name={fixture.homeTeam.name}
                      logoUrl={fixture.homeTeam.logoUrl}
                    />

                    <div className="text-center">
                      <div className="inline-flex min-w-[132px] items-center justify-center rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-3xl font-black text-white">
                        {fixture.result.homeScore} - {fixture.result.awayScore}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-white/55">
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                          {formatResultDate(fixture.kickoffAt)}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                          {formatResultTime(fixture.kickoffAt)}
                        </span>
                        {fixture.pitch ? (
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                            {fixture.pitch}
                          </span>
                        ) : null}
                      </div>
                      {fixture.result.isDisputed ? (
                        <div className="mt-3 inline-flex rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                          Result under review
                        </div>
                      ) : null}
                    </div>

                    <TeamBadge
                      id={fixture.awayTeam.id}
                      name={fixture.awayTeam.name}
                      logoUrl={fixture.awayTeam.logoUrl}
                      align="right"
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
