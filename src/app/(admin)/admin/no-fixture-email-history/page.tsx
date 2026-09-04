import Link from "next/link";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getWeekStartForDate } from "@/lib/team-week-unavailability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SOURCE_TYPE = "team-no-fixture-capacity";
const DAY_MS = 24 * 60 * 60 * 1000;

function parseSourceId(sourceId: string | null) {
  if (!sourceId) return null;
  const parts = sourceId.split(":");
  if (parts.length !== 3) return null;
  const [leagueId, teamId, weekBeginning] = parts;
  if (!leagueId || !teamId || !/^\d{4}-\d{2}-\d{2}$/.test(weekBeginning)) {
    return null;
  }
  return { leagueId, teamId, weekBeginning };
}

function formatStamp(value: Date | null) {
  if (!value) return "Not sent yet";
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFixtureKickoff(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWeek(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return formatDateTimeInLondon(date, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusClasses(status: string) {
  if (status === "SENT") {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  }
  if (status === "QUEUED" || status === "PROCESSING") {
    return "border-sky-400/25 bg-sky-500/10 text-sky-100";
  }
  if (status === "FAILED") {
    return "border-red-400/25 bg-red-500/10 text-red-100";
  }
  return "border-amber-400/25 bg-amber-500/10 text-amber-100";
}

function fixtureHistoryKey(input: {
  leagueId: string;
  teamId: string;
  weekBeginning: string;
}) {
  return `${input.leagueId}:${input.teamId}:${input.weekBeginning}`;
}

export default async function NoFixtureEmailHistoryPage() {
  await requireAdmin();

  const dispatches = await prisma.notificationDispatch.findMany({
    where: { sourceType: SOURCE_TYPE },
    include: {
      recipient: {
        select: {
          displayName: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 150,
  });

  const parsed = dispatches.flatMap((dispatch) => {
    const source = parseSourceId(dispatch.sourceId);
    return source ? [{ dispatch, ...source }] : [];
  });

  const teamIds = Array.from(new Set(parsed.map((item) => item.teamId)));
  const leagueIds = Array.from(new Set(parsed.map((item) => item.leagueId)));
  const weekDates = parsed
    .map((item) => new Date(`${item.weekBeginning}T00:00:00.000Z`))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const rangeStart = weekDates[0]
    ? new Date(weekDates[0].getTime() - DAY_MS)
    : null;
  const rangeEnd = weekDates.at(-1)
    ? new Date((weekDates.at(-1) as Date).getTime() + 8 * DAY_MS)
    : null;

  const [teams, leagues, fixtures] = await Promise.all([
    teamIds.length
      ? prisma.team.findMany({
          where: { id: { in: teamIds } },
          select: { id: true, name: true },
        })
      : [],
    leagueIds.length
      ? prisma.league.findMany({
          where: { id: { in: leagueIds } },
          select: { id: true, name: true, season: true },
        })
      : [],
    teamIds.length && leagueIds.length && rangeStart && rangeEnd
      ? prisma.fixture.findMany({
          where: {
            leagueId: { in: leagueIds },
            kickoffAt: { gte: rangeStart, lt: rangeEnd },
            status: { not: "CANCELLED" },
            OR: [
              { homeTeamId: { in: teamIds } },
              { awayTeamId: { in: teamIds } },
            ],
          },
          select: {
            id: true,
            leagueId: true,
            homeTeamId: true,
            awayTeamId: true,
            kickoffAt: true,
            status: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
          orderBy: [{ kickoffAt: "asc" }],
        })
      : [],
  ]);

  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const leagueNameById = new Map(
    leagues.map((league) => [
      league.id,
      league.season ? `${league.name} · ${league.season}` : league.name,
    ]),
  );

  const fixturesByHistoryKey = new Map<string, typeof fixtures>();
  for (const fixture of fixtures) {
    const weekBeginning = getWeekStartForDate(fixture.kickoffAt)
      .toISOString()
      .slice(0, 10);

    for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
      const key = fixtureHistoryKey({
        leagueId: fixture.leagueId,
        teamId,
        weekBeginning,
      });
      const existing = fixturesByHistoryKey.get(key) ?? [];
      existing.push(fixture);
      fixturesByHistoryKey.set(key, existing);
    }
  }

  const recordsWithLaterFixture = parsed.filter((item) =>
    fixturesByHistoryKey.has(
      fixtureHistoryKey({
        leagueId: item.leagueId,
        teamId: item.teamId,
        weekBeginning: item.weekBeginning,
      }),
    ),
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-sky-400/15 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_35%),rgba(255,255,255,0.03)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] md:p-8">
        <Link
          href="/admin/night-board"
          className="text-sm font-medium text-sky-200 hover:text-sky-100"
        >
          ← Back to Night Board
        </Link>
        <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-200/65">
          Communication history
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          No-fixture email history
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
          Permanent record of teams that were sent the “no fixture this week” capacity email. A team stays in this history even if it later receives a fixture; those records are marked below.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Recorded emails</div>
            <div className="mt-1 text-sm text-white/55">Newest first · up to 150 records</div>
          </div>
          <div className="text-3xl font-semibold text-white">{parsed.length}</div>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-sky-400/15 bg-sky-500/[0.05] px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-sky-100/55">Later received fixture</div>
            <div className="mt-1 text-sm text-sky-100/55">Same league and week</div>
          </div>
          <div className="text-3xl font-semibold text-sky-100">{recordsWithLaterFixture}</div>
        </div>
      </div>

      {parsed.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-10 text-center text-sm text-white/50">
          No no-fixture emails have been recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {parsed.map(({ dispatch, teamId, leagueId, weekBeginning }) => {
            const laterFixtures =
              fixturesByHistoryKey.get(
                fixtureHistoryKey({ leagueId, teamId, weekBeginning }),
              ) ?? [];

            return (
              <article
                key={dispatch.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-white">
                        {teamNameById.get(teamId) ?? dispatch.recipient.displayName ?? "Team"}
                      </h2>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(dispatch.status)}`}
                      >
                        {dispatch.status}
                      </span>
                      {laterFixtures.length > 0 ? (
                        <span className="rounded-full border border-sky-300/30 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-100">
                          FIXTURE LATER ADDED
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm text-white/55">
                      {leagueNameById.get(leagueId) ?? "League"}
                    </div>
                    <div className="mt-2 text-sm text-white/65">
                      Week beginning {formatWeek(weekBeginning)}
                    </div>

                    {laterFixtures.length > 0 ? (
                      <div className="mt-3 space-y-2 rounded-xl border border-sky-400/20 bg-sky-500/[0.07] px-3 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100/65">
                          Fixture subsequently recorded for this week
                        </div>
                        {laterFixtures.map((fixture) => {
                          const opponent =
                            fixture.homeTeamId === teamId
                              ? fixture.awayTeam.name
                              : fixture.homeTeam.name;
                          return (
                            <Link
                              key={fixture.id}
                              href={`/admin/fixtures/${fixture.id}/edit`}
                              className="block text-sm text-sky-100 transition hover:text-white"
                            >
                              vs {opponent} · {formatFixtureKickoff(fixture.kickoffAt)}
                              {fixture.status !== "SCHEDULED" ? ` · ${fixture.status.toLowerCase()}` : ""}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}

                    {dispatch.failureReason ? (
                      <div className="mt-3 rounded-xl border border-red-400/15 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100/80">
                        {dispatch.failureReason}
                      </div>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-sm text-white/55 lg:text-right">
                    <div>
                      {dispatch.sentAt ? "Sent" : "Queued"} {formatStamp(dispatch.sentAt ?? dispatch.createdAt)}
                    </div>
                    {dispatch.sentAt ? (
                      <div className="mt-1 text-xs text-white/35">
                        Queued {formatStamp(dispatch.createdAt)}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
