// ========================================
// File: src/app/player/team/[teamid]/availability/page.tsx
// ========================================

import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { FixtureStatus, TeamRole, UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { updatePlayerFixtureAvailabilityAction } from "./actions";

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

function getFixtureLabel(input: {
  homeTeamName: string;
  awayTeamName: string;
}) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
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

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "availability-updated":
      return "Availability updated.";
    case "invalid":
      return "Please choose a valid availability response.";
    case "not-linked":
      return "You are not linked to this team.";
    case "fixture-not-found":
      return "That fixture could not be found.";
    case "squad-full":
      return "The matchday squad has already been picked for this fixture, so you cannot mark yourself as available now. You can still choose maybe or unavailable, or contact SIXFL if this is wrong.";
    default:
      return null;
  }
}

function getSelectedMemberIds(input: {
  playerMatchFees: Array<{ teamMemberId: string | null }>;
}) {
  return new Set(
    input.playerMatchFees
      .map((fee) => fee.teamMemberId)
      .filter((id): id is string => Boolean(id)),
  );
}

function getAvailabilityHref(input: {
  teamId: string;
  fixtureId?: string | null;
  previewMembershipId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.fixtureId) params.set("fixtureId", input.fixtureId);
  if (input.previewMembershipId) {
    params.set("previewMembershipId", input.previewMembershipId);
  }

  const query = params.toString();
  return `/player/team/${input.teamId}/availability${query ? `?${query}` : ""}`;
}

function getTeamDashboardHref(input: {
  teamId: string;
  previewMembershipId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.previewMembershipId) {
    params.set("previewMembershipId", input.previewMembershipId);
  }

  const query = params.toString();
  return `/player/team/${input.teamId}${query ? `?${query}` : ""}`;
}

export default async function PlayerAvailabilityPage({
  params,
  searchParams,
}: PageProps) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/availability`)}`);
  }

  const email = session.user.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
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
              logoUrl: true,
              matchdayTargetSize: true,
              league: {
                select: {
                  id: true,
                  name: true,
                  season: true,
                  slug: true,
                  venueName: true,
                  dayOfWeek: true,
                },
              },
            },
          },
        },
        take: 1,
      },
    },
  });

  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/availability`)}`);
  }

  const previewMembershipId =
    user.role === UserRole.ADMIN ? sp.previewMembershipId?.trim() || null : null;

  const previewMembership = previewMembershipId
    ? await prisma.teamMember.findFirst({
        where: {
          id: previewMembershipId,
          teamId: teamid,
        },
        select: {
          id: true,
          role: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
              matchdayTargetSize: true,
              league: {
                select: {
                  id: true,
                  name: true,
                  season: true,
                  slug: true,
                  venueName: true,
                  dayOfWeek: true,
                },
              },
            },
          },
        },
      })
    : null;

  if (previewMembershipId && !previewMembership) {
    notFound();
  }

  const membership = previewMembership ?? user.teamMembers[0] ?? null;
  const isPreviewMode = Boolean(previewMembership);
  const previewMembershipParam = isPreviewMode ? membership?.id : null;

  if (!membership && user.role !== UserRole.ADMIN) {
    notFound();
  }

  const team =
    membership?.team ??
    (await prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        matchdayTargetSize: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            slug: true,
            venueName: true,
            dayOfWeek: true,
          },
        },
      },
    }));

  if (!team) notFound();

  const now = new Date();
  const fixtures = await prisma.fixture.findMany({
    where: {
      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      kickoffAt: { gte: now },
      status: { in: [FixtureStatus.SCHEDULED, FixtureStatus.POSTPONED] },
    },
    orderBy: { kickoffAt: "asc" },
    take: 12,
    select: {
      id: true,
      kickoffAt: true,
      status: true,
      pitch: true,
      homeTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      venue: { select: { name: true } },
      playerMatchFees: {
        where: {
          teamId: teamid,
          status: {
            not: "CANCELLED",
          },
        },
        select: {
          teamMemberId: true,
        },
      },
      availabilities: membership
        ? {
            where: { teamMemberId: membership.id },
            select: {
              response: true,
              note: true,
              respondedAt: true,
            },
            take: 1,
          }
        : false,
    },
  });

  const selectedFixture =
    fixtures.find((fixture) => fixture.id === sp.fixtureId) ?? fixtures[0] ?? null;
  const selectedAvailability = selectedFixture?.availabilities?.[0] ?? null;
  const selectedMemberIds = selectedFixture
    ? getSelectedMemberIds(selectedFixture)
    : new Set<string>();
  const targetSize = team.matchdayTargetSize ?? 0;
  const selectedCount = selectedMemberIds.size;
  const squadIsFull = targetSize > 0 && selectedCount >= targetSize;
  const playerAlreadySelected = membership ? selectedMemberIds.has(membership.id) : false;
  const availableOptionLocked = squadIsFull && !playerAlreadySelected;
  const savedMessage = getSavedMessage(sp.saved);
  const previewedPlayerName =
    previewMembership?.user?.name || previewMembership?.user?.email || "this player";

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        {isPreviewMode ? (
          <section className="rounded-3xl border border-violet-400/25 bg-violet-500/10 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-100/75">
                  Admin player preview
                </p>
                <p className="mt-2 text-sm leading-6 text-violet-50/80">
                  You are viewing availability as {previewedPlayerName}. Saving this form will update that player’s real availability.
                </p>
              </div>
              <Link
                href={`/admin/teams/${teamid}`}
                className="inline-flex items-center justify-center rounded-xl border border-violet-300/30 bg-black/20 px-4 py-2.5 text-sm font-semibold text-violet-50 transition hover:bg-violet-500/15"
              >
                Back to admin team
              </Link>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Player dashboard
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Confirm availability
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                Use this page to tell SIXFL if you can play. Please do not reply by text — your response needs to be recorded here.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {team.name}
                </span>
                {team.league?.name ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                    {team.league.name}
                    {team.league.season ? ` · ${team.league.season}` : ""}
                  </span>
                ) : null}
                {membership?.role ? (
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                    {getRoleLabel(membership.role)}
                  </span>
                ) : null}
                {targetSize > 0 ? (
                  <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-100">
                    Target squad: {targetSize}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={getTeamDashboardHref({
                  teamId: teamid,
                  previewMembershipId: previewMembershipParam,
                })}
                className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
              >
                Team dashboard
              </Link>
              {team.league?.slug ? (
                <Link
                  href={`/leagues/${team.league.slug}`}
                  className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  League page
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {savedMessage ? (
          <section className={`rounded-2xl border p-4 text-sm ${sp.saved === "squad-full" ? "border-amber-400/25 bg-amber-500/10 text-amber-100" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"}`}>
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
                <h2 className="mt-2 text-xl font-semibold text-white">Choose fixture</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">
                {fixtures.length} upcoming
              </span>
            </div>

            <div className="mt-5 space-y-2">
              {fixtures.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                  No upcoming fixtures are currently published for your team.
                </div>
              ) : null}

              {fixtures.map((fixture) => {
                const availability = fixture.availabilities?.[0] ?? null;
                const isSelected = selectedFixture?.id === fixture.id;
                const fixtureSelectedMemberIds = getSelectedMemberIds(fixture);
                const fixtureSelectedCount = fixtureSelectedMemberIds.size;
                const fixtureSquadIsFull = targetSize > 0 && fixtureSelectedCount >= targetSize;
                const fixturePlayerSelected = membership ? fixtureSelectedMemberIds.has(membership.id) : false;

                return (
                  <Link
                    key={fixture.id}
                    href={getAvailabilityHref({
                      teamId: teamid,
                      fixtureId: fixture.id,
                      previewMembershipId: previewMembershipParam,
                    })}
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getResponseClasses(availability?.response)}`}>
                        {getResponseLabel(availability?.response)}
                      </span>
                      {fixtureSquadIsFull ? (
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${fixturePlayerSelected ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-amber-400/25 bg-amber-500/10 text-amber-100"}`}>
                          {fixturePlayerSelected ? "You are in the squad" : "Squad picked"}
                        </span>
                      ) : targetSize > 0 ? (
                        <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/60">
                          {fixtureSelectedCount}/{targetSize} picked
                        </span>
                      ) : null}
                    </div>
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
                  {getFixtureLabel({
                    homeTeamName: selectedFixture.homeTeam.name,
                    awayTeamName: selectedFixture.awayTeam.name,
                  })}
                </h2>
                <p className="mt-2 text-sm text-white/60">
                  {formatFixtureDate(selectedFixture.kickoffAt)}
                  {selectedFixture.venue?.name ? ` · ${selectedFixture.venue.name}` : ""}
                  {selectedFixture.pitch ? ` · ${selectedFixture.pitch}` : ""}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getResponseClasses(selectedAvailability?.response)}`}>
                    Current: {getResponseLabel(selectedAvailability?.response)}
                  </span>
                  {targetSize > 0 ? (
                    <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/60">
                      {selectedCount}/{targetSize} squad places picked
                    </span>
                  ) : null}
                  {squadIsFull ? (
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${playerAlreadySelected ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-amber-400/25 bg-amber-500/10 text-amber-100"}`}>
                      {playerAlreadySelected ? "You are in the squad" : "Squad already picked"}
                    </span>
                  ) : null}
                </div>

                {squadIsFull && !playerAlreadySelected ? (
                  <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
                    The matchday squad has already been picked for this fixture. You can still mark yourself as maybe or unavailable, but you cannot mark yourself as available now.
                  </div>
                ) : null}

                {selectedAvailability?.respondedAt ? (
                  <p className="mt-2 text-xs text-white/45">
                    Last updated {formatFixtureDate(selectedAvailability.respondedAt)}
                  </p>
                ) : null}

                <form action={updatePlayerFixtureAvailabilityAction} className="mt-6 space-y-5">
                  <input type="hidden" name="teamId" value={teamid} />
                  <input type="hidden" name="fixtureId" value={selectedFixture.id} />
                  {previewMembershipParam ? (
                    <input type="hidden" name="previewMembershipId" value={previewMembershipParam} />
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { value: "AVAILABLE", label: "Available", copy: availableOptionLocked ? "Squad already picked" : "I can play", classes: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" },
                      { value: "MAYBE", label: "Maybe", copy: "Not sure yet", classes: "border-amber-400/25 bg-amber-500/10 text-amber-100" },
                      { value: "UNAVAILABLE", label: "Unavailable", copy: "I cannot play", classes: "border-red-400/25 bg-red-500/10 text-red-100" },
                    ].map((option) => {
                      const disabled = option.value === "AVAILABLE" && availableOptionLocked;

                      return (
                        <label
                          key={option.value}
                          className={`flex flex-col gap-2 rounded-2xl border p-4 transition ${option.classes} ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-white/[0.06]"}`}
                        >
                          <input
                            type="radio"
                            name="response"
                            value={option.value}
                            defaultChecked={selectedAvailability?.response === option.value}
                            disabled={disabled}
                            required
                          />
                          <span className="text-base font-semibold">{option.label}</span>
                          <span className="text-xs opacity-75">{option.copy}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="note" className="text-sm text-white/60">
                      Optional note
                    </label>
                    <textarea
                      id="note"
                      name="note"
                      rows={3}
                      defaultValue={selectedAvailability?.note ?? ""}
                      placeholder="Optional — for example, I can arrive after 7pm."
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                    />
                  </div>

                  <button
                    type="submit"
                    className="inline-flex items-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
                  >
                    Save availability
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                No fixture is available to respond to yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
