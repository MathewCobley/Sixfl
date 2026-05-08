
// ========================================
// File: src/app/(admin)/admin/leagues/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamContactSnapshot } from "@/lib/notifications/team-contacts";
import LeagueForm from "@/components/admin/leagues/LeagueForm";
import TeamBadge from "@/components/admin/TeamBadge";
import {
  deleteLeagueAction,
  updateLeagueAction,
} from "@/app/(admin)/admin/leagues/actions";

function formatDay(dayOfWeek: string | null) {
  if (!dayOfWeek) {
    return "—";
  }

  switch (dayOfWeek) {
    case "MONDAY":
      return "Monday";
    case "TUESDAY":
      return "Tuesday";
    case "WEDNESDAY":
      return "Wednesday";
    case "THURSDAY":
      return "Thursday";
    case "FRIDAY":
      return "Friday";
    case "SATURDAY":
      return "Saturday";
    case "SUNDAY":
      return "Sunday";
    case "ANY":
      return "Any";
    default:
      return dayOfWeek;
  }
}

function formatLeagueType(leagueType: string | null) {
  if (!leagueType) {
    return "—";
  }

  switch (leagueType) {
    case "MENS":
      return "Mens";
    case "WOMENS":
      return "Womens";
    case "YOUTH":
      return "Youth";
    default:
      return leagueType;
  }
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditLeaguePage({
  params,
  searchParams,
}: Props) {
  await requireAdmin();

  const { id } = await params;
  const resolvedSearchParams = await searchParams;

  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      teams: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          claimCode: true,
          createdAt: true,
          captainUserId: true,
          captainLinkedAt: true,
          captainClaimedAt: true,
        },
        orderBy: {
          name: "asc",
        },
      },
      _count: {
        select: {
          teams: true,
          fixtures: true,
          interestLeads: true,
        },
      },
    },
  });

  if (!league) {
    notFound();
  }

  const teamContacts = await Promise.all(
    league.teams.map((team) => getTeamContactSnapshot(team.id)),
  );

  const contactMap = new Map<string, NonNullable<(typeof teamContacts)[number]>>();
  for (const snapshot of teamContacts) {
    if (snapshot) {
      contactMap.set(snapshot.teamId, snapshot);
    }
  }

  const boundUpdateAction = updateLeagueAction.bind(null, league.id);
  const boundDeleteAction = deleteLeagueAction.bind(null, league.id);

  const created = resolvedSearchParams?.created === "1";
  const deleteError = resolvedSearchParams?.deleteError === "linked-records";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href="/admin/leagues"
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to leagues
          </Link>

          <h1 className="text-3xl font-semibold text-white">{league.name}</h1>

          <p className="text-sm text-white/60">
            Admin view for this league. Edit settings, review linked teams, and
            manage the live setup.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/teams/new"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Add team
          </Link>

          <Link
            href={`/leagues/${league.slug}`}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            View public page
          </Link>
        </div>
      </div>

      {created ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          League created successfully.
        </div>
      ) : null}

      {deleteError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          You cannot delete a league while it still has linked teams, fixtures,
          or leads.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="mb-6 text-lg font-semibold text-white">
              League settings
            </h2>

            <LeagueForm
              mode="edit"
              action={boundUpdateAction}
              initialValues={{
                name: league.name,
                slug: league.slug,
                season: league.season ?? "",
                isActive: league.isActive,
                area: league.area ?? "",
                dayOfWeek: league.dayOfWeek ?? "",
                leagueType: league.leagueType ?? "",
                venueName: league.venueName ?? "",
                kickoffInfo: league.kickoffInfo ?? "",
                format: league.format ?? "",
                surface: league.surface ?? "",
                description: league.description ?? "",
                heroImageUrl: league.heroImageUrl ?? "",
                badgeUrl: league.badgeUrl ?? "",
                ctaText: league.ctaText ?? "",
              }}
            />
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  League communications
                </h2>
                <p className="mt-1 text-sm text-white/60">
                  Whole-league email and SMS sending now lives in the dedicated communications page.
                </p>
              </div>

              <Link
                href={`/admin/leagues/${league.id}/communications`}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Open communications
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  Teams
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {league._count.teams}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  Email-ready teams
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {Array.from(contactMap.values()).filter((snapshot) => Boolean(snapshot.primaryContact.email?.trim())).length}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  SMS-ready teams
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {Array.from(contactMap.values()).filter((snapshot) => Boolean(snapshot.primaryContact.phone?.trim())).length}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Teams in this league
                </h2>
                <p className="mt-1 text-sm text-white/60">
                  Real linked teams for this league, including the contact
                  details you can message.
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-medium text-white/70">
                {league._count.teams} team{league._count.teams === 1 ? "" : "s"}
              </div>
            </div>

            {league.teams.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
                No teams are linked to this league yet.
              </div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
                <div className="divide-y divide-white/10">
                  {league.teams.map((team) => {
                    const isClaimed = Boolean(
                      team.captainUserId || team.captainLinkedAt || team.captainClaimedAt,
                    );
                    const snapshot = contactMap.get(team.id);

                    return (
                      <div
                        key={team.id}
                        className="flex flex-col gap-4 bg-black/20 px-4 py-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <TeamBadge
                            name={team.name}
                            logoUrl={team.logoUrl}
                            size="sm"
                          />

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/admin/teams/${team.id}`}
                                className="text-base font-semibold text-white transition hover:text-emerald-300"
                              >
                                {team.name}
                              </Link>

                              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60">
                                {isClaimed ? "Claimed" : "Unclaimed"}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/50">
                              <span>
                                Email: {snapshot?.primaryContact.email ?? "—"}
                              </span>
                              <span>
                                Phone: {snapshot?.primaryContact.phone ?? "—"}
                              </span>
                              <span>Claim code: {team.claimCode}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/teams/${team.id}`}
                            className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
                          >
                            Open team
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">League snapshot</h2>

            <div className="mt-4 space-y-4 text-sm text-white/70">
              <div className="flex items-center justify-between">
                <span>Teams</span>
                <span className="font-medium text-white">
                  {league._count.teams}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Fixtures</span>
                <span className="font-medium text-white">
                  {league._count.fixtures}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Interest leads</span>
                <span className="font-medium text-white">
                  {league._count.interestLeads}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Area</span>
                <span className="font-medium text-white">
                  {league.area ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Venue</span>
                <span className="font-medium text-white">
                  {league.venueName ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Night</span>
                <span className="font-medium text-white">
                  {formatDay(league.dayOfWeek)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>League type</span>
                <span className="font-medium text-white">
                  {formatLeagueType(league.leagueType)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Status</span>
                <span className="font-medium text-white">
                  {league.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">View targets</h2>

            <div className="mt-4 space-y-3">
              <Link
                href={`/leagues/${league.slug}`}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 transition hover:bg-black/30 hover:text-white"
              >
                <span>Public league page</span>
                <span>→</span>
              </Link>

              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/45">
                Captain view to come
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/45">
                Referee view to come
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6">
            <h2 className="text-lg font-semibold text-white">Danger zone</h2>
            <p className="mt-2 text-sm text-red-100/80">
              Delete this league only if nothing is linked to it yet.
            </p>

            <form action={boundDeleteAction} className="mt-5">
              <button
                type="submit"
                className="inline-flex items-center rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/25"
              >
                Delete league
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
