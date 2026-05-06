// ========================================
// File: src/app/(admin)/admin/social/results/page.tsx
// ========================================

import Link from "next/link";

import FormListboxField from "@/components/ui/FormListboxField";
import ResultsCardGenerator from "@/components/admin/social/ResultsCardGenerator";
import { formatDateTimeInLondon, toLondonDateInputValue } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TEMPLATE_URL = "/social/templates/match-results-template.png";

type SearchParams = {
  leagueId?: string;
  fixtureDate?: string;
  matchweek?: string;
};

function formatDisplayDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).toUpperCase();
}

function parseDateInput(value?: string) {
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) return null;

  return {
    start: new Date(Date.UTC(year, month - 1, day, 0, 0, 0)),
    end: new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0)),
  };
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

function getMatchweekLabel(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return "MATCHWEEK";

  if (/^matchweek/i.test(trimmed)) return trimmed;
  return `MATCHWEEK ${trimmed}`;
}

export default async function AdminResultsCardGeneratorPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};

  const leagues = await prisma.league.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { season: "asc" }],
    select: {
      id: true,
      name: true,
      season: true,
    },
  });

  const selectedLeagueId = sp.leagueId ?? leagues[0]?.id ?? "";
  const selectedLeague = leagues.find((league) => league.id === selectedLeagueId) ?? leagues[0] ?? null;

  const latestCompletedFixture = selectedLeague
    ? await prisma.fixture.findFirst({
        where: {
          leagueId: selectedLeague.id,
          result: { isNot: null },
        },
        orderBy: [{ kickoffAt: "desc" }],
        select: {
          kickoffAt: true,
        },
      })
    : null;

  const fixtureDateInput =
    sp.fixtureDate ??
    (latestCompletedFixture ? toLondonDateInputValue(latestCompletedFixture.kickoffAt) : toLondonDateInputValue(new Date()));
  const dateRange = parseDateInput(fixtureDateInput);

  const fixtures = selectedLeague && dateRange
    ? await prisma.fixture.findMany({
        where: {
          leagueId: selectedLeague.id,
          kickoffAt: {
            gte: dateRange.start,
            lt: dateRange.end,
          },
          result: { isNot: null },
        },
        orderBy: [{ kickoffAt: "asc" }, { position: "asc" }, { pitch: "asc" }],
        take: 3,
        select: {
          id: true,
          kickoffAt: true,
          homeTeam: {
            select: {
              name: true,
              logoUrl: true,
            },
          },
          awayTeam: {
            select: {
              name: true,
              logoUrl: true,
            },
          },
          result: {
            select: {
              homeScore: true,
              awayScore: true,
            },
          },
        },
      })
    : [];

  const resultCardFixtures = fixtures
    .filter((fixture) => fixture.result)
    .map((fixture) => ({
      id: fixture.id,
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      homeTeamLogoUrl: normaliseLogoUrl(fixture.homeTeam.logoUrl),
      awayTeamLogoUrl: normaliseLogoUrl(fixture.awayTeam.logoUrl),
      homeScore: fixture.result?.homeScore ?? 0,
      awayScore: fixture.result?.awayScore ?? 0,
    }));

  const selectedDate = dateRange?.start ?? new Date();
  const leagueOptions = leagues.map((league) => ({
    value: league.id,
    label: league.season ? `${league.name} · ${league.season}` : league.name,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),rgba(255,255,255,0.03)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Social card generator
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              Match results card
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              Generate a square Instagram/Facebook results graphic using the Canva template saved at <span className="font-mono text-white/80">public/social/templates/match-results-template.png</span>.
            </p>
          </div>

          <Link
            href="/admin/social"
            className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]"
          >
            Back to social
          </Link>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-semibold text-white">Card inputs</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Choose the league/date, then download the generated PNG from the preview.
          </p>

          <form className="mt-6 space-y-5" action="/admin/social/results">
            <FormListboxField
              name="leagueId"
              value={selectedLeague?.id ?? ""}
              options={leagueOptions}
              placeholder="Choose league"
            />

            <label className="block space-y-2 text-sm font-medium text-white/65">
              <span>Fixture date</span>
              <input
                type="date"
                name="fixtureDate"
                defaultValue={fixtureDateInput}
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/50"
              />
            </label>

            <label className="block space-y-2 text-sm font-medium text-white/65">
              <span>Matchweek</span>
              <input
                type="text"
                name="matchweek"
                defaultValue={sp.matchweek ?? ""}
                placeholder="Example: 4"
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50"
              />
            </label>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20"
            >
              Load results
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/55">
            <div className="font-semibold text-white">Loaded results</div>
            <div className="mt-1">
              {resultCardFixtures.length} completed fixture{resultCardFixtures.length === 1 ? "" : "s"} found for this card.
            </div>
            {resultCardFixtures.length < 3 ? (
              <div className="mt-2 text-amber-100/80">
                This template has room for 3 rows. Add/complete more results if you want all rows filled.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          {resultCardFixtures.length > 0 ? (
            <ResultsCardGenerator
              templateUrl={TEMPLATE_URL}
              leagueName={selectedLeague?.name ?? "SIXFL"}
              matchweekLabel={getMatchweekLabel(sp.matchweek)}
              dateLabel={formatDisplayDate(selectedDate)}
              fixtures={resultCardFixtures}
            />
          ) : (
            <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-12 text-center">
              <h2 className="text-xl font-semibold text-white">No completed results found</h2>
              <p className="mt-2 text-sm leading-6 text-white/55">
                Choose a league/date with completed fixtures, then the preview will appear here.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
