// ========================================
// File: src/app/captain/team/[teamid]/availability/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import InjuredPlayerState, {
  InjuredPlayerBadge,
} from "@/components/captain/InjuredPlayerState";
import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { getTeamMemberSquadStatusMap } from "@/lib/managed-squad/squadStatus";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";
import {
  resetFixtureAvailabilityAction,
  sendAvailabilitySmsChaseAction,
  updateFixtureAvailabilityAction,
} from "./actions";

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

const AVAILABILITY_SMS_CHASE_SOURCE_TYPE = "CAPTAIN_AVAILABILITY_SMS_CHASE";

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
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
    case "fixture-availability-reset":
      return "Fixture availability reset. Old responses and chase history for this fixture have been cleared, so you can chase players again for the rearranged date.";
    default:
      return saved ? decodeURIComponent(saved) : null;
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

function getSmsSourceId(input: { fixtureId: string; teamMemberId: string }) {
  return `${input.fixtureId}:${input.teamMemberId}`;
}

function getSmsStatusClasses(status?: string) {
  switch (status) {
    case "SENT":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "QUEUED":
    case "PROCESSING":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "FAILED":
    case "SKIPPED":
    case "CANCELLED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.04] text-white/55";
  }
}

function getSmsStatusText(dispatch?: {
  status: string;
  createdAt: Date;
  scheduledFor: Date;
  sentAt: Date | null;
  failedAt: Date | null;
}) {
  if (!dispatch) return "No SMS chase sent yet";

  switch (dispatch.status) {
    case "SENT":
      return `SMS sent ${formatShortDateTime(dispatch.sentAt ?? dispatch.createdAt)}`;
    case "QUEUED":
      return `SMS queued ${formatShortDateTime(dispatch.scheduledFor ?? dispatch.createdAt)}`;
    case "PROCESSING":
      return `SMS processing ${formatShortDateTime(dispatch.createdAt)}`;
    case "FAILED":
      return `SMS failed ${formatShortDateTime(dispatch.failedAt ?? dispatch.createdAt)}`;
    case "SKIPPED":
      return `SMS skipped ${formatShortDateTime(dispatch.createdAt)}`;
    case "CANCELLED":
      return `SMS cancelled ${formatShortDateTime(dispatch.createdAt)}`;
    default:
      return `SMS logged ${formatShortDateTime(dispatch.createdAt)}`;
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
  const access = await requireCaptain(teamid);
  const canOpenAdminComms = access.isAdmin;

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      league: { select: { name: true, season: true, venueName: true } },
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!team) notFound();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const fixtures = await prisma.fixture.findMany({
    where: {
      ...publishedFixtureWhere,
      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      kickoffAt: { gte: since },
      status: { in: ["SCHEDULED", "POSTPONED"] },
    },
    orderBy: [{ kickoffAt: "asc" }],
    take: 10,
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { name: true } },
      availabilities: {
        where: { teamMember: { teamId: teamid } },
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

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const teamMemberIds = team.members.map((member) => member.id);

  const [
    teamMemberProfilesByMemberId,
    squadStatusByMemberId,
    smsDispatches,
  ] = await Promise.all([
    getTeamMemberProfilesByTeamMemberIds(teamMemberIds),
    getTeamMemberSquadStatusMap(teamid),
    fixtureIds.length && teamMemberIds.length
      ? prisma.notificationDispatch.findMany({
          where: {
            sourceType: AVAILABILITY_SMS_CHASE_SOURCE_TYPE,
            OR: fixtureIds.flatMap((fixtureId) =>
              teamMemberIds.map((teamMemberId) => ({
                sourceId: getSmsSourceId({ fixtureId, teamMemberId }),
              })),
            ),
          },
          select: {
            sourceId: true,
            status: true,
            createdAt: true,
            scheduledFor: true,
            sentAt: true,
            failedAt: true,
          },
          orderBy: [{ createdAt: "desc" }],
        })
      : Promise.resolve([]),
  ]);

  const smsDispatchBySourceId = new Map<string, (typeof smsDispatches)[number]>();
  for (const dispatch of smsDispatches) {
    if (dispatch.sourceId && !smsDispatchBySourceId.has(dispatch.sourceId)) {
      smsDispatchBySourceId.set(dispatch.sourceId, dispatch);
    }
  }

  const allResponses = fixtures.flatMap((fixture) => {
    const availabilityByMemberId = new Map(
      fixture.availabilities.map((item) => [item.teamMemberId, item]),
    );

    return team.members.map((member) =>
      squadStatusByMemberId.get(member.id)?.squadStatus === "INJURED"
        ? "UNAVAILABLE"
        : availabilityByMemberId.get(member.id)?.response ?? "NO_RESPONSE",
    );
  });

  const totalAvailable = allResponses.filter((response) => response === "AVAILABLE").length;
  const totalMaybe = allResponses.filter((response) => response === "MAYBE").length;
  const totalUnavailable = allResponses.filter(
    (response) => response === "UNAVAILABLE",
  ).length;
  const totalNoResponse = allResponses.filter(
    (response) => response === "NO_RESPONSE",
  ).length;
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
              Manage availability fixture-by-fixture. Use the chase button for players who have not replied. Use reset after a postponed fixture is rearranged.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {team.league?.name ?? "No league assigned"}
                {team.league?.season ? ` - ${team.league.season}` : ""}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                {team.members.length} squad member
                {team.members.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-100">
                {fixtures.length} fixture{fixtures.length === 1 ? "" : "s"} shown
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
              {canOpenAdminComms ? (
                <Link
                  href={`/admin/teams/${teamid}/communications`}
                  className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
                >
                  Team communications
                </Link>
              ) : null}
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
                No response
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{totalNoResponse}</p>
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
            No upcoming or recently postponed fixtures found.
          </section>
        ) : null}

        {fixtures.map((fixture) => {
          const availabilityByMemberId = new Map(
            fixture.availabilities.map((item) => [item.teamMemberId, item]),
          );
          const fixtureResponses = team.members.map((member) =>
            squadStatusByMemberId.get(member.id)?.squadStatus === "INJURED"
              ? "UNAVAILABLE"
              : availabilityByMemberId.get(member.id)?.response ?? "NO_RESPONSE",
          );
          const availableCount = fixtureResponses.filter(
            (response) => response === "AVAILABLE",
          ).length;
          const maybeCount = fixtureResponses.filter(
            (response) => response === "MAYBE",
          ).length;
          const unavailableCount = fixtureResponses.filter(
            (response) => response === "UNAVAILABLE",
          ).length;
          const noResponseCount = fixtureResponses.filter(
            (response) => response === "NO_RESPONSE",
          ).length;

          return (
            <section
              key={fixture.id}
              id={`fixture-${fixture.id}`}
              className="scroll-mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]"
            >
              <div className="border-b border-white/10 px-6 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                      Fixture
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-white">
                        {fixture.homeTeam.name} vs {fixture.awayTeam.name}
                      </h2>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                          fixture.status === "POSTPONED"
                            ? "border-amber-400/25 bg-amber-500/10 text-amber-100"
                            : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                        }`}
                      >
                        {fixture.status.toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-white/60">
                      {formatDateTime(fixture.kickoffAt)} - {fixture.venue?.name ?? team.league?.venueName ?? "Venue TBC"}
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
                    <form action={resetFixtureAvailabilityAction}>
                      <input type="hidden" name="teamid" value={teamid} />
                      <input type="hidden" name="fixtureId" value={fixture.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center rounded-full border border-red-400/30 bg-red-500/10 px-4 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-500/20"
                        title="Clear old availability replies and SMS chase history for this rearranged fixture."
                      >
                        Reset availability
                      </button>
                    </form>
                  </div>
                </div>
                <p className="mt-3 max-w-4xl text-xs leading-5 text-red-100/55">
                  Use Reset availability after a postponed/rearranged fixture date changes. It clears old replies and allows fresh chases for this fixture.
                </p>
              </div>

              <div className="divide-y divide-white/10">
                {team.members.map((member) => {
                  const availability = availabilityByMemberId.get(member.id);
                  const squadStatus = squadStatusByMemberId.get(member.id);
                  const isInjured = squadStatus?.squadStatus === "INJURED";
                  const response = isInjured
                    ? "UNAVAILABLE"
                    : availability?.response ?? "NO_RESPONSE";
                  const memberName = member.user.name || member.user.email || "Unnamed user";
                  const memberProfile = teamMemberProfilesByMemberId.get(member.id);
                  const memberPhone = memberProfile?.phone?.trim() || null;
                  const smsDispatch = smsDispatchBySourceId.get(
                    getSmsSourceId({
                      fixtureId: fixture.id,
                      teamMemberId: member.id,
                    }),
                  );

                  return (
                    <div
                      key={member.id}
                      className={`grid gap-4 px-6 py-5 xl:grid-cols-[1fr_340px] ${
                        isInjured
                          ? "border-l-4 border-l-red-400 bg-red-500/[0.06]"
                          : ""
                      }`}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-white">
                            {memberName}
                          </div>
                          {isInjured ? (
                            <InjuredPlayerBadge note={squadStatus?.squadStatusNote} />
                          ) : null}
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getResponseClasses(
                              response,
                            )}`}
                          >
                            {response.replace("_", " ")}
                          </span>
                        </div>

                        <div className="mt-2 space-y-1 text-sm text-white/60">
                          <div>{member.user.email || "No email on account"}</div>
                          <div>
                            {memberPhone ? (
                              <a
                                href={`tel:${memberPhone.replace(/\s+/g, "")}`}
                                className="text-emerald-100/85 underline-offset-4 transition hover:text-emerald-50 hover:underline"
                              >
                                {memberPhone}
                              </a>
                            ) : (
                              <span className="text-white/35">
                                No phone number on profile
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <div
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                              isInjured
                                ? "border-red-400/25 bg-red-500/10 text-red-100"
                                : getSmsStatusClasses(smsDispatch?.status)
                            }`}
                          >
                            {isInjured
                              ? "SMS chases disabled"
                              : getSmsStatusText(smsDispatch)}
                          </div>
                          {canOpenAdminComms ? (
                            <Link
                              href={`/admin/teams/${teamid}/players/${member.id}/communications`}
                              className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                            >
                              Player comms
                            </Link>
                          ) : null}
                        </div>

                        {availability?.note ? (
                          <div className="mt-2 text-sm text-white/55">
                            Note: {availability.note}
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Link
                            href={`/captain/team/${teamid}/squad/${member.id}/edit`}
                            className="inline-flex w-full items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-center text-sm font-medium text-sky-100 transition hover:bg-sky-500/15"
                          >
                            Edit player
                          </Link>
                          {canOpenAdminComms ? (
                            <Link
                              href={`/admin/teams/${teamid}/players/${member.id}/communications`}
                              className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-center text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                            >
                              Player comms
                            </Link>
                          ) : null}
                        </div>

                        {isInjured ? (
                          <InjuredPlayerState
                            context="availability"
                            note={squadStatus?.squadStatusNote}
                          />
                        ) : (
                          <>
                            <form
                              action={updateFixtureAvailabilityAction}
                              className="space-y-3"
                            >
                              <input type="hidden" name="teamid" value={teamid} />
                              <input
                                type="hidden"
                                name="fixtureId"
                                value={fixture.id}
                              />
                              <input
                                type="hidden"
                                name="teamMemberId"
                                value={member.id}
                              />
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

                            <form action={sendAvailabilitySmsChaseAction}>
                              <input type="hidden" name="teamid" value={teamid} />
                              <input
                                type="hidden"
                                name="fixtureId"
                                value={fixture.id}
                              />
                              <input
                                type="hidden"
                                name="teamMemberId"
                                value={member.id}
                              />
                              <button
                                type="submit"
                                disabled={!memberPhone}
                                className="inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
                              >
                                {memberPhone ? "Chase by SMS" : "No phone to chase"}
                              </button>
                            </form>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
