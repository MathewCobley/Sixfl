// ========================================
// File: src/app/(admin)/admin/teams/[id]/availability/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { FixtureStatus, TeamMode } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    fixtureId?: string;
  }>;
};

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFixtureLabel(input: {
  homeTeamName: string;
  awayTeamName: string;
}) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
}

function getResponseLabel(response?: string | null) {
  switch (response) {
    case "AVAILABLE":
      return "Available";
    case "MAYBE":
      return "Maybe";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      return "No response";
  }
}

function getResponseClasses(response?: string | null) {
  switch (response) {
    case "AVAILABLE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "MAYBE":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "UNAVAILABLE":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.04] text-white/60";
  }
}

export default async function AdminManagedTeamAvailabilityPage({
  params,
  searchParams,
}: Props) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      teamMode: true,
      matchdayTargetSize: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
        },
      },
    },
  });

  if (!team) notFound();

  const now = new Date();
  const fixtures = await prisma.fixture.findMany({
    where: {
      OR: [{ homeTeamId: id }, { awayTeamId: id }],
      kickoffAt: { gte: now },
      status: { in: [FixtureStatus.SCHEDULED, FixtureStatus.POSTPONED] },
    },
    orderBy: { kickoffAt: "asc" },
    take: 20,
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { id: true, name: true } },
    },
  });

  const selectedFixture =
    fixtures.find((fixture) => fixture.id === sp.fixtureId) ?? fixtures[0] ?? null;

  const [members, selections] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId: id },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        fixtureAvailabilities: selectedFixture
          ? {
              where: { fixtureId: selectedFixture.id },
              select: {
                response: true,
                note: true,
                respondedAt: true,
              },
              take: 1,
            }
          : false,
      },
    }),
    selectedFixture
      ? prisma.fixtureSelection.findMany({
          where: {
            fixtureId: selectedFixture.id,
          },
          select: {
            teamMemberId: true,
            selectionStatus: true,
          },
        })
      : [],
  ]);

  const selectionByMemberId = new Map(
    selections.map((selection) => [selection.teamMemberId, selection.selectionStatus]),
  );

  const counts = members.reduce(
    (acc, member) => {
      const response = member.fixtureAvailabilities?.[0]?.response ?? "NO_RESPONSE";
      if (response === "AVAILABLE") acc.available += 1;
      else if (response === "MAYBE") acc.maybe += 1;
      else if (response === "UNAVAILABLE") acc.unavailable += 1;
      else acc.noResponse += 1;
      return acc;
    },
    { available: 0, maybe: 0, unavailable: 0, noResponse: 0 },
  );

  const selectedCount = selections.filter(
    (selection) => selection.selectionStatus === "SELECTED",
  ).length;

  const playerAvailabilityUrl = selectedFixture
    ? `/player/team/${team.id}/availability?fixtureId=${selectedFixture.id}`
    : `/player/team/${team.id}/availability`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Link
            href={`/admin/teams/${team.id}`}
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to team
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Managed team availability
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Availability dashboard
          </h1>
          <p className="max-w-3xl text-sm text-white/60">
            Players confirm availability in their SIXFL player dashboard. Do not ask them to reply YES/NO by text — use the dashboard link so every response is recorded.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/teams/${team.id}/match-fees`}
            className="inline-flex items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15"
          >
            Player match fees
          </Link>
          <Link
            href={`/captain/team/${team.id}/squad`}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Squad view
          </Link>
        </div>
      </div>

      {team.teamMode !== TeamMode.MANAGED ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          This team is currently set as a standard team. This dashboard will still work, but it is designed for organiser-managed teams.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/60">Available</p>
          <p className="mt-2 text-3xl font-semibold text-white">{counts.available}</p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-amber-100/60">Maybe</p>
          <p className="mt-2 text-3xl font-semibold text-white">{counts.maybe}</p>
        </div>
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-red-100/60">Unavailable</p>
          <p className="mt-2 text-3xl font-semibold text-white">{counts.unavailable}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-white/45">No response</p>
          <p className="mt-2 text-3xl font-semibold text-white">{counts.noResponse}</p>
        </div>
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-100/60">Selected</p>
          <p className="mt-2 text-3xl font-semibold text-white">{selectedCount}</p>
          <p className="mt-1 text-xs text-sky-100/70">
            Target {team.matchdayTargetSize ?? "—"}
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Choose fixture</h2>
          <p className="mt-1 text-sm text-white/55">
            Select the fixture you want player availability for.
          </p>

          <div className="mt-5 space-y-2">
            {fixtures.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
                No upcoming fixtures exist for this team yet.
              </div>
            ) : null}

            {fixtures.map((fixture) => {
              const isSelected = selectedFixture?.id === fixture.id;
              return (
                <Link
                  key={fixture.id}
                  href={`/admin/teams/${team.id}/availability?fixtureId=${fixture.id}`}
                  className={`block rounded-2xl border p-4 transition ${
                    isSelected
                      ? "border-emerald-400/30 bg-emerald-500/10 text-white"
                      : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="text-sm font-semibold">
                    {getFixtureLabel({
                      homeTeamName: fixture.homeTeam.name,
                      awayTeamName: fixture.awayTeam.name,
                    })}
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {formatUkDateTime(fixture.kickoffAt)}
                    {fixture.venue?.name ? ` · ${fixture.venue.name}` : ""}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Player responses</h2>
              <p className="mt-1 text-sm text-white/55">
                Share the player dashboard link below. Responses are shown here automatically.
              </p>
            </div>

            <Link
              href={playerAvailabilityUrl}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Player dashboard link
            </Link>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/65">
            Send players this link, but ask them to answer inside the dashboard, not by text:
            <div className="mt-2 break-all rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white/80">
              {playerAvailabilityUrl}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {members.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
                No linked squad members yet.
              </div>
            ) : null}

            {members.map((member) => {
              const availability = member.fixtureAvailabilities?.[0] ?? null;
              const selectionStatus = selectionByMemberId.get(member.id) ?? "NOT_SELECTED";

              return (
                <div
                  key={member.id}
                  className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 lg:grid-cols-[1fr_auto] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-white">
                        {member.user.name || member.user.email || "Unnamed player"}
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getResponseClasses(availability?.response)}`}>
                        {getResponseLabel(availability?.response)}
                      </span>
                      {selectionStatus === "SELECTED" ? (
                        <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-100">
                          Selected
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-white/50">
                      {member.user.email || "No email"}
                    </div>
                    {availability?.respondedAt ? (
                      <div className="mt-1 text-xs text-white/35">
                        Responded {formatUkDateTime(availability.respondedAt)}
                      </div>
                    ) : null}
                    {availability?.note ? (
                      <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
                        {availability.note}
                      </div>
                    ) : null}
                  </div>

                  <Link
                    href={`/admin/teams/${team.id}/match-fees?fixtureId=${selectedFixture?.id ?? ""}`}
                    className="inline-flex items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15"
                  >
                    Match fees
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
