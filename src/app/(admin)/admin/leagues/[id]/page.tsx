// ========================================
// File: src/app/(admin)/admin/leagues/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamContactSnapshot } from "@/lib/notifications/team-contacts";
import LeagueForm from "@/components/admin/leagues/LeagueForm";
import TeamBadge from "@/components/admin/TeamBadge";
import { updateLeagueAction } from "@/app/(admin)/admin/leagues/actions";

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

  const [league, requirementRows] = await Promise.all([
    prisma.league.findUnique({
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
    }),
    prisma.$queryRaw<Array<{ requiredRefereesPerNight: number }>>(Prisma.sql`
      SELECT COALESCE("requiredRefereesPerNight", 1)::int AS "requiredRefereesPerNight"
      FROM "League"
      WHERE id = ${id}
      LIMIT 1
    `),
  ]);

  if (!league) {
    notFound();
  }

  const requiredRefereesPerNight = requirementRows[0]?.requiredRefereesPerNight ?? 1;

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

  const created = resolvedSearchParams?.created === "1";

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
                requiredRefereesPerNight: String(requiredRefereesPerNight),
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
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Teams</h2>
                <p className="mt-1 text-sm text-white/60">
                  {league._count.teams} team{league._count.teams === 1 ? "" : "s"} linked to this league.
                </p>
              </div>
              <Link
                href="/admin/teams/new"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Add team
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {league.teams.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                  No teams are linked yet.
                </div>
              ) : (
                league.teams.map((team) => {
                  const contact = contactMap.get(team.id);
                  return (
                    <Link
                      key={team.id}
                      href={`/admin/teams/${team.id}`}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <TeamBadge name={team.name} logoUrl={team.logoUrl} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white">
                            {team.name}
                          </div>
                          <div className="truncate text-xs text-white/45">
                            {contact?.email || "No email"} · {contact?.phone || "No phone"}
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-white/40">
                        {team.captainClaimedAt
                          ? "Claimed"
                          : team.captainLinkedAt || team.captainUserId
                            ? "Linked"
                            : "Unclaimed"}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Overview</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-white/45">Status</dt>
                <dd className="mt-1 font-medium text-white">
                  {league.isActive ? "Active" : "Inactive"}
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Area</dt>
                <dd className="mt-1 font-medium text-white">{league.area || "—"}</dd>
              </div>
              <div>
                <dt className="text-white/45">Day</dt>
                <dd className="mt-1 font-medium text-white">
                  {formatDay(league.dayOfWeek)}
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Type</dt>
                <dd className="mt-1 font-medium text-white">
                  {formatLeagueType(league.leagueType)}
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Refs needed per night</dt>
                <dd className="mt-1 font-medium text-white">
                  {requiredRefereesPerNight}
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Fixtures</dt>
                <dd className="mt-1 font-medium text-white">{league._count.fixtures}</dd>
              </div>
              <div>
                <dt className="text-white/45">Leads</dt>
                <dd className="mt-1 font-medium text-white">{league._count.interestLeads}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
