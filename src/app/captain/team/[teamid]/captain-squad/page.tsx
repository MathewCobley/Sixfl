// ========================================
// File: src/app/captain/team/[teamid]/captain-squad/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamRole } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Squad | SIXFL",
};

type SearchParams = {
  error?: string;
};

function getRoleLabel(role: TeamRole) {
  switch (role) {
    case "CAPTAIN":
      return "Captain";
    case "MANAGER":
      return "Manager";
    case "VICE_CAPTAIN":
      return "Vice captain";
    case "BACKUP_PLAYER":
      return "Backup player";
    case "COACH":
      return "Coach";
    case "PLAYER":
      return "Player";
    default:
      return role;
  }
}

function getRoleBadgeClasses(role: TeamRole) {
  switch (role) {
    case "CAPTAIN":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "MANAGER":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "VICE_CAPTAIN":
      return "border-violet-400/25 bg-violet-500/10 text-violet-100";
    case "BACKUP_PLAYER":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "COACH":
      return "border-white/15 bg-white/5 text-white/80";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function getInitials(name: string | null | undefined) {
  const parts = (name || "Player")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "P";
}

function formatUkDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPreferredNights(value: unknown) {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ") || null;
  }

  if (typeof value === "object") {
    return (
      Object.values(value as Record<string, unknown>)
        .flat()
        .filter(Boolean)
        .map(String)
        .join(", ") || null
    );
  }

  return String(value);
}

function formatAvailabilitySummary(value: string | null | undefined) {
  const cleaned = value
    ?.replace(/^\s*availability\s*:\s*/i, "")
    .trim();

  return cleaned || null;
}

function DetailPill({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;

  return (
    <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
      <span className="text-white/40">{label}:</span>
      <span className="ml-1 text-white/80">{value}</span>
    </span>
  );
}

export default async function CaptainSquadViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  const filters = await searchParams;
  const access = await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
        },
      },
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      prospects: {
        where: {
          status: "ACTIVE_SQUAD",
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!team) notFound();

  const profileByMemberId = await getTeamMemberProfilesByTeamMemberIds(
    team.members.map((member) => member.id),
  );

  const organiserCount = team.members.filter((member) =>
    ["CAPTAIN", "MANAGER", "VICE_CAPTAIN"].includes(member.role),
  ).length;
  const playerCount = team.members.filter((member) => member.role === "PLAYER").length;
  const backupCount = team.members.filter((member) => member.role === "BACKUP_PLAYER").length;
  const pendingAccountCount = team.prospects.length;
  const totalSquadCount = team.members.length + pendingAccountCount;
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Team squad
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Your squad
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              See who is currently in your team, check player availability details and keep track of anyone still finishing their SIXFL account setup.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {team.league?.name ?? "No league assigned"}
                {team.league?.season ? ` · ${team.league.season}` : ""}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                {totalSquadCount} squad player{totalSquadCount === 1 ? "" : "s"}
              </span>
              {pendingAccountCount > 0 ? (
                <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
                  {pendingAccountCount} account setup pending
                </span>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/captain/team/${teamid}`}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                Back to overview
              </Link>
              <Link
                href={`/captain/team/${teamid}/availability`}
                className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
              >
                Open availability
              </Link>
              {access.isAdmin ? (
                <Link
                  href={`/admin/teams/${teamid}/squad`}
                  className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-5 py-3 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
                >
                  Open squad console
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            {[
              { label: "Total squad", value: totalSquadCount, copy: "Players currently connected to your squad.", tone: "emerald" },
              { label: "Organisers", value: organiserCount, copy: "Captain and support roles.", tone: "amber" },
              { label: "Players", value: playerCount, copy: "Regular squad players.", tone: "white" },
              { label: "Backups", value: backupCount, copy: "Backup players available if needed.", tone: "sky" },
            ].map((metric) => {
              const toneClasses =
                metric.tone === "amber"
                  ? "border-amber-400/20 bg-amber-500/10 text-amber-100/70"
                  : metric.tone === "emerald"
                    ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70"
                    : metric.tone === "sky"
                      ? "border-sky-400/20 bg-sky-500/10 text-sky-100/70"
                      : "border-white/10 bg-white/5 text-white/55";

              return (
                <div key={metric.label} className={`rounded-3xl border p-5 ${toneClasses}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                    {metric.label}
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-white">{metric.value}</p>
                  <p className="mt-2 text-sm text-white/65">{metric.copy}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {errorMessage ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          {errorMessage}
        </section>
      ) : null}

      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Current squad
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Squad list</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70">
              {team.members.length} active
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {team.members.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No active squad members are attached to this team yet.
              </div>
            ) : null}

            {team.members.map((member) => {
              const profile = profileByMemberId.get(member.id);
              const preferredNights = formatPreferredNights(profile?.preferredNights);
              const availabilitySummary = formatAvailabilitySummary(profile?.availabilitySummary);
              const hasPublicProfileDetails = Boolean(
                profile?.ageBand ||
                  profile?.preferredPositions ||
                  profile?.experienceSummary ||
                  profile?.availabilityLevel ||
                  preferredNights ||
                  availabilitySummary,
              );

              return (
                <div key={member.id} className="flex flex-col gap-4 px-6 py-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white/70">
                      {getInitials(member.user.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-base font-semibold text-white">
                          {member.user.name || "Unnamed player"}
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getRoleBadgeClasses(member.role)}`}>
                          {getRoleLabel(member.role)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Added {formatUkDate(member.createdAt)}
                      </div>

                      {hasPublicProfileDetails ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <DetailPill label="Age" value={profile?.ageBand} />
                            <DetailPill label="Position" value={profile?.preferredPositions} />
                            <DetailPill label="Level" value={profile?.experienceSummary} />
                            <DetailPill label="Availability" value={profile?.availabilityLevel} />
                            <DetailPill label="Nights" value={preferredNights} />
                          </div>

                          {availabilitySummary ? (
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/60">
                              <span className="font-semibold text-white/70">Availability notes:</span> {availabilitySummary}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/45">
                          No availability details saved yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Squad tools
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">What this page is for</h2>
            <div className="mt-4 space-y-3 text-sm text-white/65">
              <p>Use this page to check who is in your squad and see the availability details saved for each player.</p>
              <p>For matchday planning, use the availability page to see who can play and chase any missing responses.</p>
              <p>Need a name, role or player changed? Message SIXFL and we will update the squad for you.</p>
            </div>
          </section>

          {pendingAccountCount > 0 ? (
            <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Account setup pending
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Players still being linked</h2>
              <p className="mt-2 text-sm text-amber-100/75">
                These players are part of your squad, but their SIXFL account setup still needs finishing.
              </p>
              <div className="mt-4 space-y-3">
                {team.prospects.map((prospect) => {
                  const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim();

                  return (
                    <div key={prospect.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      <div className="font-semibold text-white">{fullName || "Unnamed player"}</div>
                      <div className="mt-1 text-xs text-white/45">
                        Added {formatUkDate(prospect.updatedAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Quick actions
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <Link
                href={`/captain/team/${teamid}/availability`}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Manage availability
              </Link>
              <Link
                href={`/captain/team/${teamid}/fixtures`}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Open fixtures
              </Link>
              <Link
                href={`/captain/team/${teamid}/results`}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Open results
              </Link>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
