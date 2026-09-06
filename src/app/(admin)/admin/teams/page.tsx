// ========================================
// File: src/app/(admin)/admin/teams/page.tsx
// ========================================

import TeamMoveConfirmationSelect from "@/components/admin/teams/TeamMoveConfirmationSelect";
import Link from "next/link";
import { UserRole } from "@prisma/client";

import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import CopyToClipboardButton from "@/components/admin/CopyToClipboardButton";
import TeamBadge from "@/components/admin/TeamBadge";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { deleteTeamAction } from "./actions";

async function getAdminTeams() {
  return prisma.team.findMany({
    select: {
      id: true,
      name: true,
      claimCode: true,
      logoUrl: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      createdAt: true,
      moveConfirmationStatus: true,
      moveConfirmationUpdatedAt: true,
      moveConfirmationUpdatedBy: true,
      captainClaimedAt: true,
      captainInviteSentAt: true,
      captainUserId: true,
      teamMode: true,
      latestKickoffTime: true,
      leagueId: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          badgeUrl: true,
          isActive: true,
          isMoving: true,
          competition: {
            select: {
              id: true,
              name: true,
              currentLeagueId: true,
              currentLeague: {
                select: {
                  id: true,
                  name: true,
                  season: true,
                  badgeUrl: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
      members: {
        where: { role: "CAPTAIN" },
        select: {
          user: {
            select: {
              email: true,
              name: true,
              role: true,
            },
          },
        },
      },
      convertedFromLead: {
        select: {
          contactName: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: [{ name: "asc" }],
  });
}

type TeamListItem = Awaited<ReturnType<typeof getAdminTeams>>[number];
type LeagueSummary = NonNullable<TeamListItem["league"]>;
type CompetitionSummary = NonNullable<LeagueSummary["competition"]>;

type TeamGroup = {
  key: string;
  label: string;
  subtitle: string;
  badgeUrl: string | null;
  openLeagueId: string | null;
  teams: TeamListItem[];
};

function formatUkDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(value);
}

function normaliseText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normaliseLeagueBadgeUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  return `/${trimmed}`;
}

function getInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "LG";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "LG";
}

function getContactName(team: TeamListItem) {
  return (
    team.contactName ||
    team.members[0]?.user?.name ||
    team.convertedFromLead?.contactName ||
    "No contact name"
  );
}

function getContactEmail(team: TeamListItem) {
  return (
    team.contactEmail ||
    team.members[0]?.user?.email ||
    team.convertedFromLead?.email ||
    "—"
  );
}

function getContactPhone(team: TeamListItem) {
  return team.contactPhone || team.convertedFromLead?.phone || "—";
}

function getCaptainAccessState(team: TeamListItem) {
  const captainUser = team.members[0]?.user;
  const hasCaptain = Boolean(captainUser?.email);
  const isAdminCaptain = captainUser?.role === UserRole.ADMIN;

  if (team.captainClaimedAt && hasCaptain && !isAdminCaptain) {
    return {
      label: "Claimed",
      className:
        "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200",
    };
  }

  if (team.captainInviteSentAt) {
    return {
      label: "Invite sent",
      className:
        "rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-200",
    };
  }

  if (hasCaptain && !isAdminCaptain) {
    return {
      label: "Captain linked",
      className:
        "rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200",
    };
  }

  if (hasCaptain && isAdminCaptain) {
    return {
      label: "Admin linked",
      className:
        "rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-[11px] text-yellow-200",
    };
  }

  return {
    label: "Unlinked",
    className:
      "rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/65",
  };
}

function getTeamIdentityKey(team: TeamListItem) {
  const competitionId = team.league?.competition?.id;
  const teamName = normaliseText(team.name);

  if (competitionId) {
    return `competition:${competitionId}:team:${teamName}`;
  }

  if (team.leagueId) {
    return `league:${team.leagueId}:team:${teamName}`;
  }

  return `unassigned:${teamName}:${normaliseText(getContactEmail(team))}:${normaliseText(
    getContactPhone(team),
  )}`;
}

function teamDisplayScore(team: TeamListItem) {
  let score = 0;

  if (team.captainClaimedAt) score += 1000;
  if (team.members[0]?.user?.email) score += 500;
  if (team.league?.competition?.currentLeagueId === team.league?.id) score += 200;
  if (team.contactEmail) score += 50;
  if (team.contactPhone) score += 25;
  if (team.captainInviteSentAt) score += 10;

  return score;
}

function dedupeTeamsForDisplay(teams: TeamListItem[]) {
  const byIdentity = new Map<string, TeamListItem>();

  for (const team of teams) {
    const key = getTeamIdentityKey(team);
    const existing = byIdentity.get(key);

    if (!existing) {
      byIdentity.set(key, team);
      continue;
    }

    const existingScore = teamDisplayScore(existing);
    const newScore = teamDisplayScore(team);

    if (
      newScore > existingScore ||
      (newScore === existingScore && team.createdAt < existing.createdAt)
    ) {
      byIdentity.set(key, team);
    }
  }

  return [...byIdentity.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function getGroupKey(team: TeamListItem) {
  const competitionId = team.league?.competition?.id;
  if (competitionId) return `competition:${competitionId}`;
  if (team.leagueId) return `league:${team.leagueId}`;
  return "__unassigned__";
}

function buildGroupFromTeam(team: TeamListItem): TeamGroup {
  const competition = team.league?.competition ?? null;
  const currentLeague = competition?.currentLeague ?? null;

  if (competition) {
    return {
      key: `competition:${competition.id}`,
      label: competition.name,
      subtitle: `Current season: ${currentLeague?.season || "not set"}. Season entries and divisions are managed from the league season page.`,
      badgeUrl: normaliseLeagueBadgeUrl(currentLeague?.badgeUrl || team.league?.badgeUrl),
      openLeagueId: competition.currentLeagueId || team.league?.id || null,
      teams: [],
    };
  }

  if (team.league) {
    return {
      key: `league:${team.league.id}`,
      label: `${team.league.name}${team.league.season ? ` • ${team.league.season}` : ""}`,
      subtitle: team.league.isActive
        ? "Legacy league record not yet grouped under a parent competition."
        : "Inactive legacy league record.",
      badgeUrl: normaliseLeagueBadgeUrl(team.league.badgeUrl),
      openLeagueId: team.league.id,
      teams: [],
    };
  }

  return {
    key: "__unassigned__",
    label: "Unassigned teams",
    subtitle: "Teams waiting to be assigned to a competition.",
    badgeUrl: null,
    openLeagueId: null,
    teams: [],
  };
}

function groupTeams(teams: TeamListItem[]) {
  const canonicalTeams = dedupeTeamsForDisplay(teams);
  const groups = new Map<string, TeamGroup>();

  for (const team of canonicalTeams) {
    const key = getGroupKey(team);
    const existing = groups.get(key) ?? buildGroupFromTeam(team);
    existing.teams.push(team);
    groups.set(key, existing);
  }

  return [...groups.values()].sort((a, b) => {
    if (a.key === "__unassigned__") return 1;
    if (b.key === "__unassigned__") return -1;
    return a.label.localeCompare(b.label);
  });
}

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    deleted?: string;
    error?: string;
    regenerated?: string;
  }>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const deleted = sp.deleted === "1";
  const regenerated = sp.regenerated === "1";
  const error = sp.error;
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const allTeams = await getAdminTeams();
  const displayTeams = dedupeTeamsForDisplay(allTeams);
  const groups = groupTeams(allTeams);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-white">Teams</h1>
          <p className="text-sm text-white/60">
            Manage team identities by competition. Teams are shown once even if they appear in more than one season.
          </p>
        </div>

        <Link
          href="/admin/teams/new"
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Add team
        </Link>
      </div>

      {(deleted || regenerated || error) && (
        <div className="space-y-1 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
          {deleted ? <div className="text-emerald-300">Team deleted.</div> : null}
          {regenerated ? (
            <div className="text-emerald-300">Claim code regenerated.</div>
          ) : null}
          {error === "missing_id" ? (
            <div className="text-red-300">Action failed (missing id).</div>
          ) : null}
          {error === "has_fixtures" ? (
            <div className="text-red-300">
              Can’t delete this team because fixtures already exist for it.
            </div>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Team identities
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {displayTeams.length}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Competitions
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {groups.filter((group) => group.key !== "__unassigned__").length}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Claimed teams
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {displayTeams.filter((team) => Boolean(team.captainClaimedAt)).length}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Hidden season duplicates
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {Math.max(allTeams.length - displayTeams.length, 0)}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <section
            key={group.key}
            className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
          >
            <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-6 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-2 text-lg font-semibold text-emerald-200">
                  {group.badgeUrl ? (
                    <img
                      src={group.badgeUrl}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    getInitials(group.label)
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="truncate text-xl font-semibold text-white">
                      {group.label}
                    </h2>

                    {group.openLeagueId ? (
                      <Link
                        href={`/admin/leagues/${group.openLeagueId}`}
                        className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/15"
                      >
                        Open current season
                      </Link>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60">
                        No competition assigned
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-white/55">{group.subtitle}</p>
                </div>
              </div>

              <div className="inline-flex items-center rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm font-medium text-white/75">
                {group.teams.length} team{group.teams.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="divide-y divide-white/10">
              {group.teams.map((team) => {
                const captainUser = team.members[0]?.user;
                const accessState = getCaptainAccessState(team);
                const claimLink = `${baseUrl}/claim?code=${encodeURIComponent(
                  team.claimCode,
                )}`;
                const isManagedTeam = team.teamMode === "MANAGED";
                const currentSeason = team.league?.competition?.currentLeague?.season;

                return (
                  <div
                    key={team.id}
                    className="grid gap-5 px-6 py-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] xl:items-center"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      <TeamBadge
                        name={team.name}
                        logoUrl={team.logoUrl}
                        size="sm"
                      />

                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-base font-semibold text-white">
                            {team.name}
                          </div>
                          <span className={accessState.className}>{accessState.label}</span>
                          {isManagedTeam ? (
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200">
                              Managed team
                            </span>
                          ) : null}
                          {team.latestKickoffTime ? (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/65">
                              Latest KO {team.latestKickoffTime}
                            </span>
                          ) : null}
                        </div>

                        <div className="grid gap-2 text-sm text-white/70 md:grid-cols-2">
                          <div>
                            <span className="text-white/45">Contact:</span> {getContactName(team)}
                          </div>
                          <div>
                            <span className="text-white/45">Email:</span>{" "}
                            <span className="break-all">{getContactEmail(team)}</span>
                          </div>
                          <div>
                            <span className="text-white/45">Phone:</span> {getContactPhone(team)}
                          </div>
                          <div>
                            <span className="text-white/45">Created:</span> {formatUkDate(team.createdAt)}
                          </div>
                        </div>

                        <TeamMoveConfirmationSelect
                          enabled={team.league?.isMoving === true}
                          teamId={team.id}
                          teamName={team.name}
                          initialStatus={team.moveConfirmationStatus}
                          initialUpdatedAt={team.moveConfirmationUpdatedAt?.toISOString() ?? null}
                          initialUpdatedBy={team.moveConfirmationUpdatedBy}
                        />

                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
                          <span className="font-mono text-white/70">{team.claimCode}</span>
                          <CopyToClipboardButton
                            text={claimLink}
                            label="Copy claim link"
                            className="rounded-lg border border-white/10 px-3 py-1.5 text-white/80 hover:bg-white/5"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 text-sm text-white/65 xl:justify-self-start">
                      <div>
                        <span className="text-white/45">Competition:</span> {group.label}
                      </div>
                      <div>
                        <span className="text-white/45">Current season:</span>{" "}
                        {currentSeason || "—"}
                      </div>
                      <div>
                        <span className="text-white/45">Captain email:</span>{" "}
                        <span className="break-all">{captainUser?.email ?? "—"}</span>
                      </div>
                      <div>
                        <span className="text-white/45">Team ID:</span>{" "}
                        <span className="font-mono text-xs text-white/70">{team.id}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                      <Link
                        href={`/captain/team/${team.id}`}
                        className="inline-flex min-w-[110px] items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15"
                      >
                        Captain view
                      </Link>

                      {isManagedTeam ? (
                        <>
                          <Link
                            href={`/admin/teams/${team.id}/prospects`}
                            className="inline-flex min-w-[110px] items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                          >
                            Prospects
                          </Link>
                          <Link
                            href={`/admin/teams/${team.id}/communications`}
                            className="inline-flex min-w-[120px] items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                          >
                            Squad coms
                          </Link>
                        </>
                      ) : (
                        <Link
                          href={`/admin/teams/${team.id}/communications`}
                          className="inline-flex min-w-[140px] items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                        >
                          Communications
                        </Link>
                      )}

                      <Link
                        href={`/admin/teams/${team.id}`}
                        className="inline-flex min-w-[92px] items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                      >
                        Edit
                      </Link>

                      <form action={deleteTeamAction}>
                        <input type="hidden" name="id" value={team.id} />
                        <input type="hidden" name="from" value="/admin/teams" />
                        <ConfirmDeleteButton
                          label="Delete"
                          confirmText={`Delete "${team.name}"? This cannot be undone.`}
                          className="inline-flex min-w-[92px] items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/20"
                        />
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {groups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-sm text-white/55">
            No teams created yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
