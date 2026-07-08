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
      return "The matchday squad has already been picked for this fixture, so you cannot mark yourself as available now.";
    case "selected-player-locked":
      return "You have already been selected for this fixture. If you can no longer play, please contact your captain or SIXFL so the squad and payment link can be updated properly.";
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
  const previewMembershipId = user.role === UserRole.ADMIN ? previewMembershipIdParam : null;
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

  const selectedFixture = fixtures.find((fixture) => fixture.id === sp.fixtureId) ?? fixtures[0] ?? null;
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
  const savedMessage = getSavedMessage(sp.saved);
  const previewedPlayerName = previewMembership?.user?.name || previewMembership?.user?.email;

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
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Player dashboard</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Confirm availability</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                Only published fixtures are shown here.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/75">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{team.name}</span>
                {team.league?.name ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{team.league.name}{team.league.season ? ` · ${team.league.season}` : ""}</span> : null}
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-100">{getRoleLabel(membership.role)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={getTeamDashboardHref({ teamId: teamid, previewMembershipId: previewMembershipParam })} className="rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white/80">Team dashboard</Link>
              {team.league?.slug ? <Link href={`/leagues/${team.league.slug}`} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/80">League page</Link> : null}
            </div>
          </div>
        </section>

        {savedMessage ? <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">{savedMessage}</section> : null}

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Fixtures</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Choose fixture</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">{fixtures.length} published</span>
            </div>

            <div className="mt-5 space-y-2">
              {fixtures.length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">No upcoming fixtures are currently published for your team.</div> : null}
              {fixtures.map((fixture) => {
                const availability = fixture.availabilities[0] ?? null;
                const isSelected = selectedFixture?.id === fixture.id;
                const params = new URLSearchParams();
                params.set("fixtureId", fixture.id);
                if (previewMembershipParam) params.set("previewMembershipId", previewMembershipParam);

                return (
                  <Link key={fixture.id} href={`/player/team/${teamid}/availability?${params.toString()}`} className={`block rounded-2xl border p-4 transition ${isSelected ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-black/20 hover:bg-white/[0.06]"}`}>
                    <div className="text-sm font-semibold text-white">
                      {getOpponentName({ teamId: teamid, homeTeamId: fixture.homeTeamId, homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name })}
                    </div>
                    <div className="mt-1 text-xs text-white/50">{formatFixtureDate(fixture.kickoffAt)}{fixture.venue?.name ? ` · ${fixture.venue.name}` : ""}{fixture.pitch ? ` · ${fixture.pitch}` : ""}</div>
                    <span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">{getResponseLabel(availability?.response)}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Your response</p>
            {selectedFixture ? (
              <div className="mt-2">
                <h2 className="text-2xl font-semibold text-white">{getFixtureLabel(selectedFixture)}</h2>
                <p className="mt-2 text-sm text-white/60">{formatFixtureDate(selectedFixture.kickoffAt)}{selectedFixture.venue?.name ? ` · ${selectedFixture.venue.name}` : ""}{selectedFixture.pitch ? ` · ${selectedFixture.pitch}` : ""}</p>
                <span className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60">Current: {getResponseLabel(selectedAvailability?.response)}</span>

                {squadIsFull && !playerAlreadySelected ? <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">The matchday squad has already been picked for this fixture.</div> : null}
                {playerAlreadySelected ? <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">You have already been selected for this fixture. If you can no longer play, contact your captain or SIXFL so the squad and payment link can be updated properly.</div> : null}

                <form action={updatePlayerFixtureAvailabilityAction} className="mt-6 space-y-5">
                  <input type="hidden" name="teamId" value={teamid} />
                  <input type="hidden" name="fixtureId" value={selectedFixture.id} />
                  {previewMembershipParam ? <input type="hidden" name="previewMembershipId" value={previewMembershipParam} /> : null}

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { value: "AVAILABLE", label: "Available", disabled: availableOptionLocked },
                      { value: "MAYBE", label: "Maybe", disabled: false },
                      { value: "UNAVAILABLE", label: "Unavailable", disabled: playerAlreadySelected && !previewMembership },
                    ].map((option) => (
                      <label key={option.value} className={`rounded-2xl border p-4 text-sm ${option.disabled ? "cursor-not-allowed border-white/5 bg-black/20 text-white/25" : "cursor-pointer border-white/10 bg-black/20 text-white hover:bg-white/[0.05]"}`}>
                        <input className="mr-2" type="radio" name="response" value={option.value} defaultChecked={selectedAvailability?.response === option.value} disabled={option.disabled} required />
                        {option.label}
                      </label>
                    ))}
                  </div>

                  <div>
                    <label htmlFor="note" className="block text-sm font-medium text-white/75">Optional note</label>
                    <textarea id="note" name="note" rows={4} defaultValue={selectedAvailability?.note ?? ""} placeholder="Optional — for example, I can arrive after 7pm." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400" />
                  </div>

                  <button type="submit" className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400">Save availability</button>
                </form>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-6 text-white/60">There are no published upcoming fixtures available for this team yet.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
