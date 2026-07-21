// ========================================
// File: src/app/player/team/[teamid]/availability/page.tsx
// ========================================

import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { FixtureStatus, TeamRole, UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getOpenFixturePlayerRequests } from "@/lib/fixturePlayerRequests";
import { prisma } from "@/lib/prisma";
import {
  joinPlayerFixtureWaitlistAction,
  leavePlayerFixtureWaitlistAction,
  requestPlayerWithdrawalAction,
  updatePlayerFixtureAvailabilityAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Availability | SIXFL",
};

type PageProps = {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{
    fixtureId?: string;
    saved?: string;
    previewMembershipId?: string;
  }>;
};

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRoleLabel(role: TeamRole) {
  switch (role) {
    case TeamRole.CAPTAIN:
      return "Captain";
    case TeamRole.MANAGER:
      return "Manager";
    case TeamRole.COACH:
      return "Coach";
    case TeamRole.VICE_CAPTAIN:
      return "Vice captain";
    case TeamRole.BACKUP_PLAYER:
      return "Backup player";
    default:
      return "Player";
  }
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

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "availability-updated":
      return "Availability updated.";
    case "invalid":
      return "Please choose a valid availability response.";
    case "not-linked":
      return "You are not linked to this team.";
    case "fixture-not-found":
      return "That fixture is not published or could not be found.";
    case "squad-full":
      return "The matchday squad has already been picked. Join the waiting list instead and your captain will be told you are available if a place opens.";
    case "selected-player-locked":
      return "You have already been selected for this fixture. Your availability is now locked; use the withdrawal request below if you can no longer play.";
    case "withdrawal-reason-required":
      return "Please briefly explain why you can no longer play so your captain has the information needed to update the squad.";
    case "withdrawal-requested":
      return "Your captain has been told that you can no longer play. You remain selected until they update the matchday squad and any payment record.";
    case "not-selected":
      return "You are not currently selected for this fixture.";
    case "already-selected":
      return "You are already selected for this fixture.";
    case "squad-not-full":
      return "There is still room in the squad, so mark yourself as available instead of joining the waiting list.";
    case "waitlist-joined":
      return "You are on the waiting list for this fixture and your captain has been notified.";
    case "waitlist-left":
      return "You have left the waiting list for this fixture.";
    default:
      return null;
  }
}

function getFixtureLabel(fixture: {
  homeTeam: { name: string };
  awayTeam: { name: string };
}) {
  return `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`;
}

function getOpponentName(input: {
  teamId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
}) {
  return input.homeTeamId === input.teamId
    ? input.awayTeamName
    : input.homeTeamName;
}

function getPlayerAvailabilityHref(input: {
  teamId: string;
  fixtureId?: string | null;
  previewMembershipId?: string | null;
}) {
  const params = new URLSearchParams();
  const fixtureId = input.fixtureId?.trim();
  const previewMembershipId = input.previewMembershipId?.trim();

  if (fixtureId) params.set("fixtureId", fixtureId);
  if (previewMembershipId) params.set("previewMembershipId", previewMembershipId);

  const query = params.toString();
  return `/player/team/${input.teamId}/availability${query ? `?${query}` : ""}`;
}

function getAdminAvailabilityHref(input: {
  teamId: string;
  fixtureId?: string | null;
}) {
  const params = new URLSearchParams();
  const fixtureId = input.fixtureId?.trim();

  if (fixtureId) params.set("fixtureId", fixtureId);

  const query = params.toString();
  return `/admin/teams/${input.teamId}/availability${query ? `?${query}` : ""}`;
}

function getTeamDashboardHref(input: {
  teamId: string;
  previewMembershipId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.previewMembershipId) params.set("previewMembershipId", input.previewMembershipId);
  const query = params.toString();
  return `/player/team/${input.teamId}${query ? `?${query}` : ""}`;
}

function HiddenFixtureFields({
  teamId,
  fixtureId,
  previewMembershipId,
}: {
  teamId: string;
  fixtureId: string;
  previewMembershipId: string | null;
}) {
  return (
    <>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="fixtureId" value={fixtureId} />
      {previewMembershipId ? (
        <input
          type="hidden"
          name="previewMembershipId"
          value={previewMembershipId}
        />
      ) : null}
    </>
  );
}

export default async function PlayerAvailabilityPage({ params, searchParams }: PageProps) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  const fixtureIdParam = sp.fixtureId?.trim() || null;
  const previewMembershipIdParam = sp.previewMembershipId?.trim() || null;
  const currentAvailabilityHref = getPlayerAvailabilityHref({
    teamId: teamid,
    fixtureId: fixtureIdParam,
    previewMembershipId: previewMembershipIdParam,
  });
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(currentAvailabilityHref)}`);
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: {
      id: true,
      role: true,
      teamMembers: {
        where: { teamId: teamid },
        select: {
          id: true,
          role: true,
          team: {
            select: {
              id: true,
              name: true,
              matchdayTargetSize: true,
              league: {
                select: { name: true, season: true, slug: true },
              },
            },
          },
        },
        take: 1,
      },
    },
  });

  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(currentAvailabilityHref)}`);

  const adminAvailabilityHref = getAdminAvailabilityHref({
    teamId: teamid,
    fixtureId: fixtureIdParam,
  });
  const previewMembershipId =
    user.role === UserRole.ADMIN ? previewMembershipIdParam : null;
  const previewMembership = previewMembershipId
    ? await prisma.teamMember.findFirst({
        where: { id: previewMembershipId, teamId: teamid },
        select: {
          id: true,
          role: true,
          user: { select: { name: true, email: true } },
          team: {
            select: {
              id: true,
              name: true,
              matchdayTargetSize: true,
              league: { select: { name: true, season: true, slug: true } },
            },
          },
        },
      })
    : null;

  if (previewMembershipId && !previewMembership) redirect(adminAvailabilityHref);

  const membership = previewMembership ?? user.teamMembers[0] ?? null;
  if (!membership) {
    if (user.role === UserRole.ADMIN) redirect(adminAvailabilityHref);
    notFound();
  }

  const previewMembershipParam = previewMembership ? membership.id : null;
  const team = membership.team;
  const now = new Date();

  const fixtures = await prisma.fixture.findMany({
    where: {
      publishedAt: { not: null },
      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      kickoffAt: { gte: now },
      status: { in: [FixtureStatus.SCHEDULED, FixtureStatus.POSTPONED] },
    },
    orderBy: { kickoffAt: "asc" },
    take: 12,
    select: {
      id: true,
      kickoffAt: true,
      pitch: true,
      homeTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      venue: { select: { name: true } },
      availabilities: {
        where: { teamMemberId: membership.id },
        select: { response: true, note: true, respondedAt: true },
        take: 1,
      },
      playerMatchFees: {
        where: { teamId: teamid, status: { not: "CANCELLED" } },
        select: { teamMemberId: true },
      },
    },
  });

  const selectedFixture =
    fixtures.find((fixture) => fixture.id === sp.fixtureId) ??
    fixtures[0] ??
    null;
  const selectedAvailability = selectedFixture?.availabilities[0] ?? null;
  const selectedMemberIds = new Set(
    (selectedFixture?.playerMatchFees ?? [])
      .map((fee) => fee.teamMemberId)
      .filter((id): id is string => Boolean(id)),
  );
  const targetSize = team.matchdayTargetSize ?? 0;
  const squadIsFull = targetSize > 0 && selectedMemberIds.size >= targetSize;
  const playerAlreadySelected = selectedMemberIds.has(membership.id);
  const availableOptionLocked = squadIsFull && !playerAlreadySelected;
  const openRequests = selectedFixture
    ? await getOpenFixturePlayerRequests({
        teamId: teamid,
        fixtureIds: [selectedFixture.id],
        teamMemberId: membership.id,
      })
    : [];
  const withdrawalRequest = openRequests.find(
    (request) => request.type === "WITHDRAWAL",
  );
  const waitlistRequest = openRequests.find(
    (request) => request.type === "WAITLIST",
  );
  const savedMessage = getSavedMessage(sp.saved);
  const previewedPlayerName =
    previewMembership?.user?.name || previewMembership?.user?.email;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        {previewMembership ? (
          <section className="rounded-3xl border border-violet-400/25 bg-violet-500/10 p-5 text-sm text-violet-50/80">
            Admin preview: viewing as {previewedPlayerName || "this player"}.
          </section>
        ) : null}

        <section className="rounded-3xl border border-emerald-400/15 bg-white/[0.04] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Player dashboard
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Confirm availability
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                Before the squad is picked you can update your response freely. Once selected, your place is locked and any withdrawal must go through your captain.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/75">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  {team.name}
                </span>
                {team.league?.name ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    {team.league.name}
                    {team.league.season ? ` · ${team.league.season}` : ""}
                  </span>
                ) : null}
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-100">
                  {getRoleLabel(membership.role)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={getTeamDashboardHref({
                  teamId: teamid,
                  previewMembershipId: previewMembershipParam,
                })}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white/80"
              >
                Team dashboard
              </Link>
              {team.league?.slug ? (
                <Link
                  href={`/leagues/${team.league.slug}`}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/80"
                >
                  League page
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {savedMessage ? (
          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            {savedMessage}
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Fixtures
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Choose fixture
                </h2>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">
                {fixtures.length} published
              </span>
            </div>

            <div className="mt-5 space-y-2">
              {fixtures.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                  No upcoming fixtures are currently published for your team.
                </div>
              ) : null}
              {fixtures.map((fixture) => {
                const availability = fixture.availabilities[0] ?? null;
                const isSelected = selectedFixture?.id === fixture.id;
                const params = new URLSearchParams();
                params.set("fixtureId", fixture.id);
                if (previewMembershipParam) {
                  params.set("previewMembershipId", previewMembershipParam);
                }

                return (
                  <Link
                    key={fixture.id}
                    href={`/player/team/${teamid}/availability?${params.toString()}`}
                    className={`block rounded-2xl border p-4 transition ${
                      isSelected
                        ? "border-emerald-400/30 bg-emerald-500/10"
                        : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="text-sm font-semibold text-white">
                      {getOpponentName({
                        teamId: teamid,
                        homeTeamId: fixture.homeTeamId,
                        homeTeamName: fixture.homeTeam.name,
                        awayTeamName: fixture.awayTeam.name,
                      })}
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      {formatFixtureDate(fixture.kickoffAt)}
                      {fixture.venue?.name ? ` · ${fixture.venue.name}` : ""}
                      {fixture.pitch ? ` · ${fixture.pitch}` : ""}
                    </div>
                    <span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">
                      {getResponseLabel(availability?.response)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Your response
            </p>
            {selectedFixture ? (
              <div className="mt-2">
                <h2 className="text-2xl font-semibold text-white">
                  {getFixtureLabel(selectedFixture)}
                </h2>
                <p className="mt-2 text-sm text-white/60">
                  {formatFixtureDate(selectedFixture.kickoffAt)}
                  {selectedFixture.venue?.name
                    ? ` · ${selectedFixture.venue.name}`
                    : ""}
                  {selectedFixture.pitch ? ` · ${selectedFixture.pitch}` : ""}
                </p>
                <span className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60">
                  Current: {getResponseLabel(selectedAvailability?.response)}
                </span>

                {playerAlreadySelected ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
                      <div className="font-semibold text-white">
                        You are selected for this fixture
                      </div>
                      <p className="mt-1 text-emerald-100/75">
                        Your availability is now locked. Changing it silently could leave the team short and could affect your match-fee record.
                      </p>
                    </div>

                    {withdrawalRequest ? (
                      <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
                        <div className="font-semibold text-white">
                          Withdrawal request sent
                        </div>
                        <p className="mt-1 text-red-100/75">
                          Your captain has been notified. You remain selected until they update the squad.
                        </p>
                        {withdrawalRequest.reason ? (
                          <p className="mt-2 rounded-xl border border-red-400/15 bg-black/20 px-3 py-2 text-red-50/80">
                            Reason: {withdrawalRequest.reason}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <form
                        action={requestPlayerWithdrawalAction}
                        className="rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-4"
                      >
                        <HiddenFixtureFields
                          teamId={teamid}
                          fixtureId={selectedFixture.id}
                          previewMembershipId={previewMembershipParam}
                        />
                        <label
                          htmlFor="withdrawalReason"
                          className="block text-sm font-semibold text-white"
                        >
                          I can no longer play
                        </label>
                        <p className="mt-1 text-sm leading-6 text-white/60">
                          Tell your captain why. This sends a request only; it does not remove you or alter payment automatically.
                        </p>
                        <textarea
                          id="withdrawalReason"
                          name="reason"
                          rows={3}
                          required
                          minLength={5}
                          placeholder="Briefly explain why you can no longer play"
                          className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-red-400"
                        />
                        <button
                          type="submit"
                          className="mt-3 rounded-xl border border-red-400/30 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-50 transition hover:bg-red-500/20"
                        >
                          Send withdrawal request
                        </button>
                      </form>
                    )}
                  </div>
                ) : (
                  <>
                    {squadIsFull ? (
                      <div className="mt-5 space-y-4">
                        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
                          <div className="font-semibold text-white">
                            The matchday squad has already been picked
                          </div>
                          <p className="mt-1 text-amber-100/75">
                            You cannot add yourself to the squad, but you can tell your captain that you are available if a place becomes free.
                          </p>
                        </div>

                        {waitlistRequest ? (
                          <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 p-4 text-sm leading-6 text-sky-100">
                            <div className="font-semibold text-white">
                              You are on the waiting list
                            </div>
                            <p className="mt-1 text-sky-100/75">
                              Your captain has been notified and can add you if a place opens.
                            </p>
                            <form
                              action={leavePlayerFixtureWaitlistAction}
                              className="mt-3"
                            >
                              <HiddenFixtureFields
                                teamId={teamid}
                                fixtureId={selectedFixture.id}
                                previewMembershipId={previewMembershipParam}
                              />
                              <button
                                type="submit"
                                className="rounded-xl border border-white/15 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.06]"
                              >
                                Leave waiting list
                              </button>
                            </form>
                          </div>
                        ) : (
                          <form
                            action={joinPlayerFixtureWaitlistAction}
                            className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.06] p-4"
                          >
                            <HiddenFixtureFields
                              teamId={teamid}
                              fixtureId={selectedFixture.id}
                              previewMembershipId={previewMembershipParam}
                            />
                            <div className="font-semibold text-white">
                              Available as a replacement?
                            </div>
                            <p className="mt-1 text-sm leading-6 text-white/60">
                              Join the waiting list and your captain will be notified straight away.
                            </p>
                            <button
                              type="submit"
                              className="mt-3 rounded-xl border border-sky-400/30 bg-sky-500/15 px-5 py-3 text-sm font-semibold text-sky-50 transition hover:bg-sky-500/20"
                            >
                              Add me to the waiting list
                            </button>
                          </form>
                        )}
                      </div>
                    ) : null}

                    <form
                      action={updatePlayerFixtureAvailabilityAction}
                      className="mt-6 space-y-5"
                    >
                      <HiddenFixtureFields
                        teamId={teamid}
                        fixtureId={selectedFixture.id}
                        previewMembershipId={previewMembershipParam}
                      />

                      <div className="grid gap-3 sm:grid-cols-3">
                        {[
                          {
                            value: "AVAILABLE",
                            label: "Available",
                            disabled: availableOptionLocked,
                          },
                          { value: "MAYBE", label: "Maybe", disabled: false },
                          {
                            value: "UNAVAILABLE",
                            label: "Unavailable",
                            disabled: false,
                          },
                        ].map((option) => (
                          <label
                            key={option.value}
                            className={`rounded-2xl border p-4 text-sm ${
                              option.disabled
                                ? "cursor-not-allowed border-white/5 bg-black/20 text-white/25"
                                : "cursor-pointer border-white/10 bg-black/20 text-white hover:bg-white/[0.05]"
                            }`}
                          >
                            <input
                              className="mr-2"
                              type="radio"
                              name="response"
                              value={option.value}
                              defaultChecked={
                                selectedAvailability?.response === option.value
                              }
                              disabled={option.disabled}
                              required
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>

                      <div>
                        <label
                          htmlFor="note"
                          className="block text-sm font-medium text-white/75"
                        >
                          Optional note
                        </label>
                        <textarea
                          id="note"
                          name="note"
                          rows={4}
                          defaultValue={selectedAvailability?.note ?? ""}
                          placeholder="Optional — for example, I can arrive after 7pm."
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400"
                        />
                      </div>

                      <button
                        type="submit"
                        className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
                      >
                        Save availability
                      </button>
                    </form>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-6 text-white/60">
                There are no published upcoming fixtures available for this team yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
