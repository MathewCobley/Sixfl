// ========================================
// File: src/app/captain/team/[teamid]/availability/history/page.tsx
// ========================================
// Note: Next.js route params for this segment are intentionally lowercase `teamid`.

import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Availability History | SIXFL",
};

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRespondedAt(value: Date | null) {
  if (!value) return "No response recorded";

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(value: Date | null) {
  if (!value) return "Never";

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";

  return `${Math.round(value)}%`;
}

function getFixtureLabel(input: {
  homeTeamName: string;
  awayTeamName: string;
}) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
}

function getResponseLabel(response: string) {
  switch (response) {
    case "AVAILABLE":
      return "Available";
    case "MAYBE":
      return "Maybe";
    case "UNAVAILABLE":
      return "Unavailable";
    case "NO_RESPONSE":
      return "Ignored / no response";
    default:
      return response.replaceAll("_", " ");
  }
}

function getResponseClasses(response: string) {
  switch (response) {
    case "AVAILABLE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "MAYBE":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "UNAVAILABLE":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function getSelectionLabel(status: string) {
  switch (status) {
    case "SELECTED":
      return "Selected";
    case "BACKUP":
      return "Backup";
    case "NOT_SELECTED":
      return "Not selected";
    default:
      return status.replaceAll("_", " ");
  }
}

function getSelectionClasses(status: string) {
  switch (status) {
    case "SELECTED":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "BACKUP":
      return "border-violet-400/25 bg-violet-500/10 text-violet-100";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function getReliabilityLabel(input: {
  fixtureCount: number;
  responseRate: number;
  responded: number;
  ignored: number;
}) {
  if (input.fixtureCount === 0) return "No history";
  if (input.responded === 0) return "Never responded";
  if (input.responseRate >= 80) return "Reliable";
  if (input.ignored >= Math.max(3, Math.ceil(input.fixtureCount / 2))) {
    return "Needs chasing";
  }
  if (input.responseRate < 50) return "Poor responder";

  return "Mixed";
}

function getReliabilityClasses(label: string) {
  switch (label) {
    case "Reliable":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "Mixed":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "Needs chasing":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "Poor responder":
      return "border-orange-400/25 bg-orange-500/10 text-orange-100";
    case "Never responded":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

export default async function CaptainAvailabilityHistoryPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          name: true,
          season: true,
          venueName: true,
        },
      },
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const fixtures = await prisma.fixture.findMany({
    where: {
      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      kickoffAt: { lt: new Date() },
    },
    orderBy: [{ kickoffAt: "desc" }],
    take: 20,
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { name: true } },
      result: {
        select: {
          homeScore: true,
          awayScore: true,
        },
      },
      availabilities: {
        where: {
          teamMember: {
            teamId: teamid,
          },
        },
        select: {
          id: true,
          response: true,
          note: true,
          respondedAt: true,
          teamMemberId: true,
        },
      },
      selections: {
        where: {
          teamMember: {
            teamId: teamid,
          },
        },
        select: {
          teamMemberId: true,
          selectionStatus: true,
          isCaptain: true,
          isGoalkeeper: true,
          note: true,
        },
      },
    },
  });

  const totalAvailable = fixtures.reduce(
    (sum, fixture) =>
      sum + fixture.availabilities.filter((item) => item.response === "AVAILABLE").length,
    0,
  );
  const totalUnavailable = fixtures.reduce(
    (sum, fixture) =>
      sum + fixture.availabilities.filter((item) => item.response === "UNAVAILABLE").length,
    0,
  );
  const totalMaybe = fixtures.reduce(
    (sum, fixture) =>
      sum + fixture.availabilities.filter((item) => item.response === "MAYBE").length,
    0,
  );
  const totalIgnored = fixtures.reduce((sum, fixture) => {
    const responded = fixture.availabilities.filter(
      (item) => item.response !== "NO_RESPONSE",
    ).length;

    return sum + Math.max(team.members.length - responded, 0);
  }, 0);

  const playerReliability = team.members
    .map((member) => {
      const stats = fixtures.reduce(
        (acc, fixture) => {
          const availability = fixture.availabilities.find(
            (item) => item.teamMemberId === member.id,
          );
          const selection = fixture.selections.find(
            (item) => item.teamMemberId === member.id,
          );
          const response = availability?.response ?? "NO_RESPONSE";

          if (response === "AVAILABLE") acc.available += 1;
          else if (response === "MAYBE") acc.maybe += 1;
          else if (response === "UNAVAILABLE") acc.unavailable += 1;
          else acc.ignored += 1;

          if (response !== "NO_RESPONSE") acc.responded += 1;
          if (selection?.selectionStatus === "SELECTED") acc.selected += 1;
          if (selection?.selectionStatus === "BACKUP") acc.backup += 1;

          if (
            availability?.respondedAt &&
            (!acc.lastRespondedAt || availability.respondedAt > acc.lastRespondedAt)
          ) {
            acc.lastRespondedAt = availability.respondedAt;
          }

          return acc;
        },
        {
          available: 0,
          maybe: 0,
          unavailable: 0,
          ignored: 0,
          responded: 0,
          selected: 0,
          backup: 0,
          lastRespondedAt: null as Date | null,
        },
      );

      const responseRate =
        fixtures.length > 0 ? (stats.responded / fixtures.length) * 100 : 0;
      const reliabilityLabel = getReliabilityLabel({
        fixtureCount: fixtures.length,
        responseRate,
        responded: stats.responded,
        ignored: stats.ignored,
      });

      return {
        ...stats,
        member,
        memberName: member.user.name || member.user.email || "Unnamed user",
        responseRate,
        reliabilityLabel,
      };
    })
    .sort((a, b) => {
      if (b.ignored !== a.ignored) return b.ignored - a.ignored;
      if (a.responseRate !== b.responseRate) return a.responseRate - b.responseRate;
      if (b.selected !== a.selected) return b.selected - a.selected;

      return a.memberName.localeCompare(b.memberName);
    });

  const neverRespondedCount = playerReliability.filter(
    (player) => fixtures.length > 0 && player.responded === 0,
  ).length;
  const poorResponderCount = playerReliability.filter(
    (player) =>
      fixtures.length > 0 && player.responded > 0 && player.responseRate < 50,
  ).length;
  const reliableCount = playerReliability.filter(
    (player) => fixtures.length > 0 && player.responseRate >= 80,
  ).length;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Matchday planning history
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Availability history
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Review previous fixtures and see who replied, who ignored the request, who was available, who was unavailable, and who was selected.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {team.league?.name ?? "No league assigned"}
                {team.league?.season ? ` · ${team.league.season}` : ""}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                Last {fixtures.length} fixture{fixtures.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/captain/team/${teamid}/availability`}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                Back to live availability
              </Link>
              <Link
                href={`/captain/team/${teamid}/fixtures`}
                className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
              >
                Open fixtures
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
                Available
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{totalAvailable}</p>
            </div>
            <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Maybe
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{totalMaybe}</p>
            </div>
            <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/70">
                Unavailable
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{totalUnavailable}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                Ignored
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{totalIgnored}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_20px_70px_rgba(0,0,0,0.24)]">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/75">
                Squad response reliability
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Who needs chasing?
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-white/60">
                Sorted with the worst responders first, so captains can quickly see who never replies, who ignores most requests, and who is reliable enough for matchday planning.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-100/65">
                  Never replied
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {neverRespondedCount}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100/65">
                  Poor reply rate
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {poorResponderCount}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/65">
                  Reliable
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {reliableCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        {playerReliability.length === 0 ? (
          <div className="px-6 py-6 text-sm text-white/60">
            No squad members found yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-black/20 text-[11px] uppercase tracking-[0.16em] text-white/45">
                <tr>
                  <th className="px-6 py-4 font-semibold">Player</th>
                  <th className="px-4 py-4 font-semibold">Status</th>
                  <th className="px-4 py-4 font-semibold">Response rate</th>
                  <th className="px-4 py-4 text-center font-semibold">Ignored</th>
                  <th className="px-4 py-4 text-center font-semibold">Available</th>
                  <th className="px-4 py-4 text-center font-semibold">Maybe</th>
                  <th className="px-4 py-4 text-center font-semibold">Unavailable</th>
                  <th className="px-4 py-4 text-center font-semibold">Selected</th>
                  <th className="px-6 py-4 text-right font-semibold">Last response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {playerReliability.map((player) => (
                  <tr
                    key={player.member.id}
                    className="bg-white/[0.015] transition hover:bg-white/[0.04]"
                  >
                    <td className="px-6 py-4 align-middle">
                      <div className="font-semibold text-white">{player.memberName}</div>
                      <div className="mt-1 text-xs text-white/45">
                        {player.member.user.email || "No email on account"}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getReliabilityClasses(
                          player.reliabilityLabel,
                        )}`}
                      >
                        {player.reliabilityLabel}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-emerald-400/80"
                            style={{ width: `${Math.min(player.responseRate, 100)}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-white/80">
                          {formatPercent(player.responseRate)}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-white/40">
                        {player.responded} of {fixtures.length} fixture
                        {fixtures.length === 1 ? "" : "s"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center align-middle text-lg font-semibold tabular-nums text-red-100">
                      {player.ignored}
                    </td>
                    <td className="px-4 py-4 text-center align-middle font-semibold tabular-nums text-emerald-100">
                      {player.available}
                    </td>
                    <td className="px-4 py-4 text-center align-middle font-semibold tabular-nums text-amber-100">
                      {player.maybe}
                    </td>
                    <td className="px-4 py-4 text-center align-middle font-semibold tabular-nums text-red-100/80">
                      {player.unavailable}
                    </td>
                    <td className="px-4 py-4 text-center align-middle font-semibold tabular-nums text-violet-100">
                      {player.selected}
                    </td>
                    <td className="px-6 py-4 text-right align-middle text-white/55">
                      {formatShortDate(player.lastRespondedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {fixtures.length === 0 ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/60">
          No previous fixtures found yet.
        </section>
      ) : (
        <div className="space-y-6">
          {fixtures.map((fixture) => {
            const availabilityByMemberId = new Map(
              fixture.availabilities.map((item) => [item.teamMemberId, item]),
            );
            const selectionByMemberId = new Map(
              fixture.selections.map((item) => [item.teamMemberId, item]),
            );

            const availableCount = fixture.availabilities.filter(
              (item) => item.response === "AVAILABLE",
            ).length;
            const maybeCount = fixture.availabilities.filter(
              (item) => item.response === "MAYBE",
            ).length;
            const unavailableCount = fixture.availabilities.filter(
              (item) => item.response === "UNAVAILABLE",
            ).length;
            const respondedCount = fixture.availabilities.filter(
              (item) => item.response !== "NO_RESPONSE",
            ).length;
            const ignoredCount = Math.max(team.members.length - respondedCount, 0);
            const selectedCount = fixture.selections.filter(
              (item) => item.selectionStatus === "SELECTED",
            ).length;

            const resultLabel = fixture.result
              ? `${fixture.result.homeScore} - ${fixture.result.awayScore}`
              : "No result recorded";

            return (
              <section
                key={fixture.id}
                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]"
              >
                <div className="border-b border-white/10 px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                        Previous fixture
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-white">
                        {getFixtureLabel({
                          homeTeamName: fixture.homeTeam.name,
                          awayTeamName: fixture.awayTeam.name,
                        })}
                      </h2>
                      <p className="mt-2 text-sm text-white/60">
                        {formatDateTime(fixture.kickoffAt)} ·{" "}
                        {fixture.venue?.name ?? team.league?.venueName ?? "Venue TBC"} · {resultLabel}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                        Available {availableCount}
                      </span>
                      <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
                        Maybe {maybeCount}
                      </span>
                      <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-100">
                        Unavailable {unavailableCount}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                        Ignored {ignoredCount}
                      </span>
                      <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-100">
                        Selected {selectedCount}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-white/10">
                  {team.members.map((member) => {
                    const availability = availabilityByMemberId.get(member.id);
                    const selection = selectionByMemberId.get(member.id);
                    const response = availability?.response ?? "NO_RESPONSE";
                    const selectionStatus = selection?.selectionStatus ?? "NOT_SELECTED";
                    const memberName = member.user.name || member.user.email || "Unnamed user";

                    return (
                      <div
                        key={member.id}
                        className="grid gap-4 px-6 py-5 lg:grid-cols-[1fr_auto] lg:items-center"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold text-white">
                              {memberName}
                            </div>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getResponseClasses(
                                response,
                              )}`}
                            >
                              {getResponseLabel(response)}
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getSelectionClasses(
                                selectionStatus,
                              )}`}
                            >
                              {getSelectionLabel(selectionStatus)}
                            </span>
                            {selection?.isCaptain ? (
                              <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                                Captain
                              </span>
                            ) : null}
                            {selection?.isGoalkeeper ? (
                              <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-100">
                                Goalkeeper
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 text-sm text-white/55">
                            {member.user.email || "No email on account"}
                          </div>

                          {availability?.note ? (
                            <div className="mt-2 text-sm text-white/55">
                              Availability note: {availability.note}
                            </div>
                          ) : null}

                          {selection?.note ? (
                            <div className="mt-2 text-sm text-white/55">
                              Selection note: {selection.note}
                            </div>
                          ) : null}
                        </div>

                        <div className="text-sm text-white/45 lg:text-right">
                          {formatRespondedAt(availability?.respondedAt ?? null)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
