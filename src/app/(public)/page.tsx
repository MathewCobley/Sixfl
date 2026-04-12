// ========================================
// File: src/app/(admin)/admin/teams/page.tsx
// ========================================

import Link from "next/link";
import {
  NotificationDispatchStatus,
  type Prisma,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { deleteTeamAction } from "./actions";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import CopyToClipboardButton from "@/components/admin/CopyToClipboardButton";
import TeamBadge from "@/components/admin/TeamBadge";

async function getAdminTeams() {
  return prisma.team.findMany({
    include: {
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          badgeUrl: true,
          isActive: true,
        },
      },
      members: {
        where: { role: "CAPTAIN" },
        include: {
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
  });
}

type TeamListItem = Awaited<ReturnType<typeof getAdminTeams>>[number];

type TeamGroup = {
  key: string;
  league: TeamListItem["league"] | null;
  teams: TeamListItem[];
};

type InviteDispatchStatusSnapshot = {
  status: NotificationDispatchStatus;
  failureReason: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

function getLeagueLabel(league: TeamListItem["league"]) {
  if (!league) return "Unassigned teams";
  return `${league.name}${league.season ? ` • ${league.season}` : ""}`;
}

function getLeagueInitials(name: string) {
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

function getMetadataRecord(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function isCaptainInviteDispatch(input: {
  metadata: Prisma.JsonValue | null;
  bodyText: string;
  subject: string | null;
}) {
  const metadata = getMetadataRecord(input.metadata);

  const templateKey =
    typeof metadata?.templateKey === "string"
      ? metadata.templateKey.trim().toLowerCase()
      : "";

  const ctaUrl =
    typeof metadata?.ctaUrl === "string"
      ? metadata.ctaUrl.trim().toLowerCase()
      : "";

  const subject = input.subject?.trim().toLowerCase() || "";
  const body = input.bodyText.toLowerCase();

  return (
    templateKey.includes("captain") ||
    subject.includes("captain") ||
    subject.includes("dashboard") ||
    body.includes("/claim?code=") ||
    body.includes("captains dashboard") ||
    ctaUrl.includes("/claim?code=")
  );
}

function looksLikeBounceFailure(reason: string | null) {
  const value = reason?.trim().toLowerCase() || "";

  if (!value) return false;

  return (
    value.includes("bounce") ||
    value.includes("bounced") ||
    value.includes("mailbox") ||
    value.includes("recipient rejected") ||
    value.includes("user unknown") ||
    value.includes("does not exist") ||
    value.includes("invalid recipient") ||
    value.includes("550")
  );
}

function getCaptainAccessState(
  team: TeamListItem,
  latestInvite: InviteDispatchStatusSnapshot | null,
) {
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

  if (latestInvite?.status === "FAILED") {
    if (looksLikeBounceFailure(latestInvite.failureReason)) {
      return {
        label: "Invite bounced",
        className:
          "rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-200",
      };
    }

    return {
      label: "Invite failed",
      className:
        "rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-200",
    };
  }

  if (
    latestInvite &&
    ["QUEUED", "PROCESSING", "SENT"].includes(latestInvite.status)
  ) {
    return {
      label: "Invite sent",
      className:
        "rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-200",
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

function groupTeamsByLeague(teams: TeamListItem[]) {
  const sorted = [...teams].sort((a, b) => {
    const aHasLeague = Boolean(a.league);
    const bHasLeague = Boolean(b.league);

    if (aHasLeague !== bHasLeague) {
      return aHasLeague ? -1 : 1;
    }

    const aLeague = a.league ? getLeagueLabel(a.league) : "ZZZ";
    const bLeague = b.league ? getLeagueLabel(b.league) : "ZZZ";
    const leagueComparison = aLeague.localeCompare(bLeague);

    if (leagueComparison !== 0) {
      return leagueComparison;
    }

    return a.name.localeCompare(b.name);
  });

  const groups = new Map<string, TeamGroup>();

  for (const team of sorted) {
    const key = team.league?.id ?? "__unassigned__";
    const existing = groups.get(key);

    if (existing) {
      existing.teams.push(team);
      continue;
    }

    groups.set(key, {
      key,
      league: team.league,
      teams: [team],
    });
  }

  return [...groups.values()];
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

  const teams = await getAdminTeams();
  const groups = groupTeamsByLeague(teams);

  const teamIds = teams.map((team) => team.id);

  const recentDispatches = teamIds.length
    ? await prisma.notificationDispatch.findMany({
        where: {
          sourceType: "TEAM",
          sourceId: {
            in: teamIds,
          },
          channel: "EMAIL",
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          sourceId: true,
          status: true,
          failureReason: true,
          sentAt: true,
          createdAt: true,
          subject: true,
          bodyText: true,
          metadata: true,
        },
      })
    : [];

  const latestCaptainInviteByTeamId = new Map<string, InviteDispatchStatusSnapshot>();

  for (const dispatch of recentDispatches) {
    if (!dispatch.sourceId) continue;
    if (latestCaptainInviteByTeamId.has(dispatch.sourceId)) continue;

    if (
      !isCaptainInviteDispatch({
        metadata: dispatch.metadata,
        bodyText: dispatch.bodyText,
        subject: dispatch.subject,
      })
    ) {
      continue;
    }

    latestCaptainInviteByTeamId.set(dispatch.sourceId, {
      status: dispatch.status,
      failureReason: dispatch.failureReason,
      sentAt: dispatch.sentAt,
      createdAt: dispatch.createdAt,
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-white">Teams</h1>
          <p className="text-sm text-white/60">
            Manage teams by league, keep contact details tidy, and jump straight
            into editing without one massive flat list.
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
            Total teams
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {teams.length}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            League groups
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {groups.length}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Claimed teams
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {teams.filter((team) => Boolean(team.captainClaimedAt)).length}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Unassigned teams
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {teams.filter((team) => !team.leagueId).length}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {groups.map((group) => {
          const leagueLabel = getLeagueLabel(group.league);
          const subtitle = group.league
            ? group.league.isActive
              ? "Linked teams in this live league"
              : "Linked teams in this inactive league"
            : "Teams waiting to be assigned to a league";

          return (
            <section
              key={group.key}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
            >
              <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-6 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-emerald-500/10 text-lg font-semibold text-emerald-200">
                    {group.league?.badgeUrl ? (
                      <img
                        src={group.league.badgeUrl}
                        alt={leagueLabel}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getLeagueInitials(group.league?.name ?? "No League")
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="truncate text-xl font-semibold text-white">
                        {leagueLabel}
                      </h2>

                      {group.league ? (
                        <Link
                          href={`/admin/leagues/${group.league.id}`}
                          className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/15"
                        >
                          Open league
                        </Link>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60">
                          No league assigned
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-white/55">{subtitle}</p>
                  </div>
                </div>

                <div className="inline-flex items-center rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm font-medium text-white/75">
                  {group.teams.length} team{group.teams.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="divide-y divide-white/10">
                {group.teams.map((team) => {
                  const captainUser = team.members[0]?.user;
                  const latestInvite =
                    latestCaptainInviteByTeamId.get(team.id) ?? null;
                  const accessState = getCaptainAccessState(team, latestInvite);
                  const claimLink = `${baseUrl}/claim?code=${encodeURIComponent(
                    team.claimCode,
                  )}`;

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

                            <span className={accessState.className}>
                              {accessState.label}
                            </span>

                            {team.latestKickoffTime ? (
                              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/65">
                                Latest KO {team.latestKickoffTime}
                              </span>
                            ) : null}
                          </div>

                          <div className="grid gap-2 text-sm text-white/70 md:grid-cols-2">
                            <div>
                              <span className="text-white/45">Contact:</span>{" "}
                              {getContactName(team)}
                            </div>
                            <div>
                              <span className="text-white/45">Email:</span>{" "}
                              <span className="break-all">{getContactEmail(team)}</span>
                            </div>
                            <div>
                              <span className="text-white/45">Phone:</span>{" "}
                              {getContactPhone(team)}
                            </div>
                            <div>
                              <span className="text-white/45">Created:</span>{" "}
                              {team.createdAt.toLocaleDateString()}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
                            <span className="font-mono text-white/70">
                              {team.claimCode}
                            </span>
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
                          <span className="text-white/45">League:</span>{" "}
                          {team.league
                            ? `${team.league.name}${
                                team.league.season ? ` • ${team.league.season}` : ""
                              }`
                            : "No league"}
                        </div>
                        <div>
                          <span className="text-white/45">Captain email:</span>{" "}
                          <span className="break-all">
                            {captainUser?.email ?? "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/45">Team ID:</span>{" "}
                          <span className="font-mono text-xs text-white/70">
                            {team.id}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                        <Link
                          href={`/captain/team/${team.id}`}
                          className="inline-flex min-w-[110px] items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15"
                        >
                          Captain view
                        </Link>

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
          );
        })}

        {groups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-sm text-white/55">
            No teams created yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}