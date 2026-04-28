// ========================================
// File: src/app/captain/team/[teamid]/availability/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { updateFixtureAvailabilityAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Availability | SIXFL",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

const responseOptions = [
  { value: "AVAILABLE", label: "Available" },
  { value: "MAYBE", label: "Maybe" },
  { value: "UNAVAILABLE", label: "Unavailable" },
  { value: "NO_RESPONSE", label: "No response" },
];

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "availability-updated":
      return "Availability updated.";
    default:
      return saved ? "Saved." : null;
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
      return "border-white/10 bg-white/5 text-white/75";
  }
}

export default async function CaptainAvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  const filters = await searchParams;

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
      kickoffAt: { gte: new Date() },
      status: "SCHEDULED",
    },
    orderBy: [{ kickoffAt: "asc" }],
    take: 5,
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { name: true } },
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
    },
  });

  const savedMessage = getSavedMessage(filters.saved);
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Matchday planning
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Availability
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Keep a live view of who is available, who is doubtful, and who still has not replied.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {team.league?.name ?? "No league assigned"}
                {team.league?.season ? ` · ${team.league.season}` : ""}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                {team.members.length} squad member{team.members.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/captain/team/${teamid}/availability/history`}
                className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
              >
                View availability history
              </Link>
              <Link
                href={`/captain/team/${teamid}/fixtures`}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
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
              <p className="mt-3 text-3xl font-semibold text-white">
                {fixtures[0]?.availabilities.filter((item) => item.response === "AVAILABLE").length ?? 0}
              </p>
            </div>
            <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Maybe
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {fixtures[0]?.availabilities.filter((item) => item.response === "MAYBE").length ?? 0}
              </p>
            </div>
            <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/70">
                Unavailable
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {fixtures[0]?.availabilities.filter((item) => item.response === "UNAVAILABLE").length ?? 0}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                No response
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {Math.max(
                  team.members.length -
                    (fixtures[0]?.availabilities.filter((item) => item.response !== "NO_RESPONSE").length ?? 0),
                  0,
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {savedMessage ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {savedMessage}
        </section>
      ) : null}

      {errorMessage ? (
        <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </section>
      ) : null}

      <div className="space-y-6">
        {fixtures.length === 0 ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/60">
            No upcoming fixtures yet.
          </section>
        ) : (
          fixtures.map((fixture) => {
            const availabilityByMemberId = new Map(
              fixture.availabilities.map((item) => [item.teamMemberId, item]),
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
            const noResponseCount = Math.max(team.members.length - respondedCount, 0);

            return (
              <section
                key={fixture.id}
                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]"
              >
                <div className="border-b border-white/10 px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                        Fixture
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-white">
                        {fixture.homeTeam.name} vs {fixture.awayTeam.name}
                      </h2>
                      <p className="mt-2 text-sm text-white/60">
                        {formatDateTime(fixture.kickoffAt)} ·{" "}
                        {fixture.venue?.name ?? team.league?.venueName ?? "Venue TBC"}
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
                        No response {noResponseCount}
                      </span>
                      <Link
                        href={`/captain/team/${teamid}/fixtures/${fixture.id}/selection`}
                        className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-1.5 text-xs font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                      >
                        Open selection
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-white/10">
                  {team.members.map((member) => {
                    const availability = availabilityByMemberId.get(member.id);
                    const response = availability?.response ?? "NO_RESPONSE";
                    const memberName =
                      member.user.name || member.user.email || "Unnamed user";

                    return (
                      <div
                        key={member.id}
                        className="grid gap-4 px-6 py-5 xl:grid-cols-[1fr_340px]"
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
                              {response.replace("_", " ")}
                            </span>
                          </div>

                          <div className="mt-2 text-sm text-white/60">
                            {member.user.email || "No email on account"}
                          </div>

                          {availability?.note ? (
                            <div className="mt-2 text-sm text-white/55">
                              Note: {availability.note}
                            </div>
                          ) : null}
                        </div>

                        <form action={updateFixtureAvailabilityAction} className="space-y-3">
                          <input type="hidden" name="teamid" value={teamid} />
                          <input type="hidden" name="fixtureId" value={fixture.id} />
                          <input type="hidden" name="teamMemberId" value={member.id} />

                          <FormListboxField
                            name="response"
                            value={response}
                            options={responseOptions}
                            placeholder="Select response"
                          />

                          <input
                            name="note"
                            type="text"
                            defaultValue={availability?.note ?? ""}
                            placeholder="Optional note"
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500/60"
                          />

                          <button
                            type="submit"
                            className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                          >
                            Save response
                          </button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
