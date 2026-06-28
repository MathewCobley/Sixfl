// ========================================
// File: src/app/(admin)/admin/fixtures/replace-team/page.tsx
// ========================================

import Link from "next/link";

import FormListboxField from "@/components/ui/FormListboxField";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { replaceTeamInFutureFixturesAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<{
    error?: string;
    replaced?: string;
    fromTeamId?: string;
    toTeamId?: string;
  }>;
};

function getErrorMessage(error?: string) {
  switch (error) {
    case "missing_teams":
      return "Choose the team being replaced and the replacement team.";
    case "same_team":
      return "The replacement team must be different from the team being replaced.";
    case "team_not_found":
      return "One of the selected teams could not be found.";
    case "league_mismatch":
      return "Both teams must be in the same league before fixtures can be swapped.";
    case "fixture_league_mismatch":
      return "One or more fixtures did not belong to the source team's league. No changes were made.";
    case "replacement_already_in_fixture":
      return "The replacement team is already in one of those fixtures, so swapping would create a team playing itself.";
    case "no_future_fixtures":
      return "There are no future scheduled fixtures to replace for that team.";
    default:
      return null;
  }
}

function teamLabel(input: {
  name: string;
  league: { name: string; season: string | null } | null;
  futureFixtureCount: number;
}) {
  const leagueLabel = input.league
    ? `${input.league.name}${input.league.season ? ` — ${input.league.season}` : ""}`
    : "No league";

  return `${input.name} • ${leagueLabel} • ${input.futureFixtureCount} future fixture${input.futureFixtureCount === 1 ? "" : "s"}`;
}

export default async function ReplaceTeamInFixturesPage({ searchParams }: PageProps) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const errorMessage = getErrorMessage(sp.error);

  const [teams, fixtures] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ league: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        leagueId: true,
        teamMode: true,
        league: {
          select: {
            name: true,
            season: true,
          },
        },
      },
    }),
    prisma.fixture.findMany({
      where: {
        status: "SCHEDULED",
        kickoffAt: { gte: new Date() },
      },
      select: {
        homeTeamId: true,
        awayTeamId: true,
      },
    }),
  ]);

  const futureCountByTeamId = new Map<string, number>();

  for (const fixture of fixtures) {
    futureCountByTeamId.set(
      fixture.homeTeamId,
      (futureCountByTeamId.get(fixture.homeTeamId) ?? 0) + 1,
    );
    futureCountByTeamId.set(
      fixture.awayTeamId,
      (futureCountByTeamId.get(fixture.awayTeamId) ?? 0) + 1,
    );
  }

  const teamsWithCounts = teams.map((team) => ({
    ...team,
    futureFixtureCount: futureCountByTeamId.get(team.id) ?? 0,
  }));

  const sourceTeamOptions = teamsWithCounts
    .filter((team) => team.futureFixtureCount > 0)
    .map((team) => ({
      value: team.id,
      label: teamLabel(team),
    }));

  const replacementTeamOptions = teamsWithCounts.map((team) => ({
    value: team.id,
    label: teamLabel(team),
  }));

  const fromTeam = sp.fromTeamId
    ? teamsWithCounts.find((team) => team.id === sp.fromTeamId) ?? null
    : null;
  const toTeam = sp.toTeamId
    ? teamsWithCounts.find((team) => team.id === sp.toTeamId) ?? null
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link href="/admin/fixtures" className="text-sm text-emerald-300 hover:text-emerald-200">
            ← Back to fixtures
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-white">Replace team in fixtures</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            Use this when a team drops out and a new team takes their place. It swaps future scheduled fixtures only, so old payments, messages and lead history stay with the old team.
          </p>
        </div>
      </div>

      {sp.replaced ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Replaced {Number(sp.replaced)} future fixture{Number(sp.replaced) === 1 ? "" : "s"}
          {fromTeam && toTeam ? `: ${fromTeam.name} → ${toTeam.name}.` : "."}
        </section>
      ) : null}

      {errorMessage ? (
        <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </section>
      ) : null}

      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm leading-6 text-amber-50/80">
        <div className="font-semibold text-white">What this does</div>
        <p className="mt-2">
          It changes the home/away team on future scheduled fixtures, resets the captain confirmation for the replacement team, removes old availability/selection rows for the dropped-out team, cancels open player match fees, and voids open team match-fee charges for the dropped-out team.
        </p>
        <p className="mt-2">
          It does not move historic messages, paid transactions, or old lead details. That history remains attached to the original team.
        </p>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <form action={replaceTeamInFutureFixturesAction} className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <FormListboxField
              name="fromTeamId"
              label="Team being replaced"
              options={sourceTeamOptions}
              placeholder="Choose dropped-out team"
            />
            <FormListboxField
              name="toTeamId"
              label="Replacement team"
              options={replacementTeamOptions}
              placeholder="Choose new team"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/55">
            Both teams must be in the same league. The replacement team must not already appear in any of the affected fixtures.
          </div>

          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
          >
            Replace future fixtures
          </button>
        </form>
      </section>
    </div>
  );
}
