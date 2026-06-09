// ========================================
// File: src/app/captain/team/[teamid]/squad/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationDispatchStatus, TeamMode, TeamRole } from "@prisma/client";

import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";
import {
  addSquadMemberAction,
  removeSquadMemberAction,
  updateSquadMemberRoleAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Squad | SIXFL",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

type PlayerInterestResponseRow = {
  id: string;
  teamMemberId: string | null;
  prospectId: string | null;
  response: string;
  respondedAt: Date;
};

const roleOptions: { value: TeamRole; label: string }[] = [
  { value: "CAPTAIN", label: "Captain" },
  { value: "MANAGER", label: "Manager" },
  { value: "PLAYER", label: "Player" },
  { value: "COACH", label: "Coach" },
  { value: "VICE_CAPTAIN", label: "Vice captain" },
  { value: "BACKUP_PLAYER", label: "Backup player" },
];

function getRoleLabel(role: TeamRole) {
  switch (role) {
    case "CAPTAIN":
      return "Captain";
    case "MANAGER":
      return "Manager";
    case "PLAYER":
      return "Player";
    case "COACH":
      return "Coach";
    case "VICE_CAPTAIN":
      return "Vice captain";
    case "BACKUP_PLAYER":
      return "Backup player";
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
    case "COACH":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean).slice(0, 2);

  if (!parts.length) return "?";

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "member-added":
      return "Squad member added.";
    case "role-updated":
      return "Squad role updated.";
    case "member-removed":
      return "Squad member removed.";
    case "activation-email-sent":
      return "Activation email queued.";
    case "activation-sms-sent":
      return "Activation SMS queued.";
    default:
      return saved ? "Saved." : null;
  }
}

function getActivationStatusText(input: {
  label: "Activation email" | "SMS chase";
  status: NotificationDispatchStatus;
  createdAt: Date;
  scheduledFor: Date;
  sentAt: Date | null;
  failedAt: Date | null;
}) {
  switch (input.status) {
    case "SENT":
      return `${input.label} sent ${formatUkDateTime(input.sentAt ?? input.createdAt)}`;
    case "QUEUED":
      return `${input.label} queued ${formatUkDateTime(input.scheduledFor ?? input.createdAt)}`;
    case "PROCESSING":
      return `${input.label} is being processed (${formatUkDateTime(input.createdAt)})`;
    case "FAILED":
      return `${input.label} failed ${formatUkDateTime(input.failedAt ?? input.createdAt)}`;
    case "SKIPPED":
      return `${input.label} skipped ${formatUkDateTime(input.createdAt)}`;
    case "CANCELLED":
      return `${input.label} cancelled ${formatUkDateTime(input.createdAt)}`;
    default:
      return `${input.label} queued ${formatUkDateTime(input.createdAt)}`;
  }
}

function getActivationStatusClasses(status?: NotificationDispatchStatus) {
  if (status === "FAILED" || status === "SKIPPED" || status === "CANCELLED") {
    return "border-red-400/20 bg-red-500/10 text-red-100";
  }

  if (status === "SENT") {
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }

  return "border-sky-400/20 bg-sky-500/10 text-sky-100";
}

function getActivationBadgeLabel(status?: NotificationDispatchStatus) {
  switch (status) {
    case "SENT":
      return "Activation sent";
    case "QUEUED":
    case "PROCESSING":
      return "Activation queued";
    case "FAILED":
      return "Activation failed";
    case "SKIPPED":
      return "Activation skipped";
    case "CANCELLED":
      return "Activation cancelled";
    default:
      return "Activation email";
  }
}

function formatPreferredNights(value: unknown) {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ") || null;
  }

  if (typeof value === "object") {
    const values = Object.values(value as Record<string, unknown>)
      .flat()
      .filter(Boolean)
      .map(String);

    return values.join(", ") || null;
  }

  return String(value);
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

function CommunicationButton({ href, label = "Comms" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
    >
      {label}
    </Link>
  );
}

function EditPlayerButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15"
    >
      Edit player
    </Link>
  );
}

function getResponseBadgeClasses(response?: string | null) {
  if (response === "YES") {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  }

  if (response === "NO") {
    return "border-red-400/25 bg-red-500/10 text-red-100";
  }

  return "border-white/10 bg-white/[0.04] text-white/55";
}

function getResponseBadgeLabel(response?: string | null) {
  if (response === "YES") return "YES — still wants to play";
  if (response === "NO") return "NO — remove / follow up";
  return "No YES/NO reply yet";
}

function PlayerResponseBadge({ response }: { response?: PlayerInterestResponseRow | null }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getResponseBadgeClasses(response?.response)}`}>
      {getResponseBadgeLabel(response?.response)}
      {response?.respondedAt ? ` · ${formatUkDateTime(response.respondedAt)}` : ""}
    </span>
  );
}

async function getPlayerInterestResponses(teamId: string) {
  try {
    return await prisma.$queryRaw<PlayerInterestResponseRow[]>`
      SELECT DISTINCT ON (COALESCE("teamMemberId", "prospectId"))
        "id",
        "teamMemberId",
        "prospectId",
        "response",
        "respondedAt"
      FROM "PlayerInterestResponse"
      WHERE "teamId" = ${teamId}
      ORDER BY COALESCE("teamMemberId", "prospectId"), "respondedAt" DESC
    `;
  } catch (error) {
    console.error("Could not load player interest responses for squad page", error);
    return [];
  }
}

export default async function CaptainSquadPage({
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
      teamMode: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      secondaryContactName: true,
      secondaryContactEmail: true,
      secondaryContactPhone: true,
      captainInviteSentAt: true,
      captainInviteSentTo: true,
      captainClaimedAt: true,
      captainLinkedAt: true,
      captainLinkedSource: true,
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
              email: true,
              image: true,
              role: true,
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
          email: true,
          phone: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!team) notFound();

  const isManagedTeam = team.teamMode === TeamMode.MANAGED;

  const [profileByMemberId, playerInterestResponses] = await Promise.all([
    getTeamMemberProfilesByTeamMemberIds(team.members.map((member) => member.id)),
    isManagedTeam ? getPlayerInterestResponses(team.id) : Promise.resolve([]),
  ]);

  const latestResponseByMemberId = new Map<string, PlayerInterestResponseRow>();
  const latestResponseByProspectId = new Map<string, PlayerInterestResponseRow>();

  for (const response of playerInterestResponses) {
    if (response.teamMemberId && !latestResponseByMemberId.has(response.teamMemberId)) {
      latestResponseByMemberId.set(response.teamMemberId, response);
    }

    if (response.prospectId && !latestResponseByProspectId.has(response.prospectId)) {
      latestResponseByProspectId.set(response.prospectId, response);
    }
  }

  const linkedMemberEmails = new Set(
    team.members
      .map((member) => member.user.email?.trim().toLowerCase() ?? null)
      .filter((email): email is string => Boolean(email)),
  );

  const pendingSquadProspects = team.prospects.filter((prospect) => {
    const normalizedEmail = prospect.email?.trim().toLowerCase() ?? null;

    if (!normalizedEmail) return true;

    return !linkedMemberEmails.has(normalizedEmail);
  });

  const [latestActivationDispatches, latestActivationSmsDispatches] = await Promise.all([
    pendingSquadProspects.length
      ? prisma.notificationDispatch.findMany({
          where: {
            sourceType: "TEAM_PLAYER_PROSPECT",
            sourceId: { in: pendingSquadProspects.map((prospect) => prospect.id) },
            template: { is: { key: "squad-activation-email" } },
          },
          select: {
            sourceId: true,
            status: true,
            createdAt: true,
            scheduledFor: true,
            sentAt: true,
            failedAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [],
    pendingSquadProspects.length
      ? prisma.notificationDispatch.findMany({
          where: {
            sourceType: "TEAM_PLAYER_PROSPECT",
            sourceId: { in: pendingSquadProspects.map((prospect) => prospect.id) },
            template: { is: { key: "squad-activation-sms" } },
          },
          select: {
            sourceId: true,
            status: true,
            createdAt: true,
            scheduledFor: true,
            sentAt: true,
            failedAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [],
  ]);

  const activationDispatchByProspectId = new Map<string, (typeof latestActivationDispatches)[number]>();

  for (const dispatch of latestActivationDispatches) {
    if (dispatch.sourceId && !activationDispatchByProspectId.has(dispatch.sourceId)) {
      activationDispatchByProspectId.set(dispatch.sourceId, dispatch);
    }
  }

  const activationSmsDispatchByProspectId = new Map<string, (typeof latestActivationSmsDispatches)[number]>();

  for (const dispatch of latestActivationSmsDispatches) {
    if (dispatch.sourceId && !activationSmsDispatchByProspectId.has(dispatch.sourceId)) {
      activationSmsDispatchByProspectId.set(dispatch.sourceId, dispatch);
    }
  }

  const captainCount = team.members.filter((member) => member.role === "CAPTAIN").length;
  const managerCount = team.members.filter((member) => member.role === "MANAGER").length;
  const playerCount = team.members.filter((member) => member.role === "PLAYER").length;
  const totalSquadCount = team.members.length + pendingSquadProspects.length;
  const yesCount = playerInterestResponses.filter((response) => response.response === "YES").length;
  const noCount = playerInterestResponses.filter((response) => response.response === "NO").length;
  const savedMessage = getSavedMessage(filters.saved);
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  const summaryMetrics = [
    { label: "Captains", value: captainCount, copy: "Linked captain roles in squad.", tone: "amber" },
    { label: "Managers", value: managerCount, copy: "Organisers and managers attached.", tone: "emerald" },
    { label: "Linked players", value: playerCount, copy: "Players with a SIXFL account.", tone: "white" },
    ...(isManagedTeam
      ? [{ label: "Responses", value: playerInterestResponses.length, copy: `${yesCount} YES · ${noCount} NO`, tone: "sky" }]
      : []),
  ];

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Squad management
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Team squad
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Control who is attached to the team, assign roles, review player details, and manage activation status.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {team.league?.name ?? "No league assigned"}
                {team.league?.season ? ` · ${team.league.season}` : ""}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                {totalSquadCount} squad player{totalSquadCount === 1 ? "" : "s"}
              </span>
              {isManagedTeam && playerInterestResponses.length > 0 ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                  {yesCount} YES · {noCount} NO
                </span>
              ) : null}
              {pendingSquadProspects.length > 0 ? (
                <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
                  {pendingSquadProspects.length} pending activation
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
                href={`/captain/team/${teamid}/prospects`}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                Open prospects
              </Link>
              {canOpenAdminComms ? (
                <Link
                  href={`/admin/teams/${teamid}/communications`}
                  className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
                >
                  Team communications
                </Link>
              ) : null}
              {canOpenAdminComms && isManagedTeam ? (
                <Link
                  href={`/admin/player-responses?teamId=${teamid}`}
                  className="inline-flex items-center rounded-full border border-sky-400/30 bg-sky-500/10 px-5 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15"
                >
                  View YES/NO responses
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            {summaryMetrics.map((metric) => {
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

      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Current squad
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Members and roles</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70">
              {totalSquadCount} total
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {team.members.length === 0 && pendingSquadProspects.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No squad members are attached to this team yet.
              </div>
            ) : null}

            {team.members.map((member) => {
              const profile = profileByMemberId.get(member.id);
              const preferredNights = formatPreferredNights(profile?.preferredNights);
              const latestResponse = latestResponseByMemberId.get(member.id);
              const hasProfileDetails = Boolean(
                profile?.phone ||
                  profile?.ageBand ||
                  profile?.preferredPositions ||
                  profile?.experienceSummary ||
                  profile?.availabilityLevel ||
                  preferredNights ||
                  profile?.availabilitySummary ||
                  profile?.notes,
              );

              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-5 px-6 py-5 xl:flex-row xl:items-start xl:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white/70">
                      {getInitials(member.user.name, member.user.email)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-base font-semibold text-white">
                          {member.user.name || "Unnamed user"}
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getRoleBadgeClasses(member.role)}`}>
                          {getRoleLabel(member.role)}
                        </span>
                        {isManagedTeam ? <PlayerResponseBadge response={latestResponse} /> : null}
                      </div>
                      <div className="mt-2 text-sm text-white/65">
                        {member.user.email || "No email on account"}
                        {profile?.phone ? ` · ${profile.phone}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Added {formatUkDateTime(member.createdAt)}
                      </div>

                      {hasProfileDetails ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <DetailPill label="Phone" value={profile?.phone} />
                            <DetailPill label="Age" value={profile?.ageBand} />
                            <DetailPill label="Position" value={profile?.preferredPositions} />
                            <DetailPill label="Level" value={profile?.experienceSummary} />
                            <DetailPill label="Availability" value={profile?.availabilityLevel} />
                            <DetailPill label="Nights" value={preferredNights} />
                          </div>

                          {profile?.availabilitySummary ? (
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/60">
                              <span className="font-semibold text-white/70">Availability notes:</span> {profile.availabilitySummary}
                            </div>
                          ) : null}

                          {profile?.notes ? (
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/60">
                              <span className="font-semibold text-white/70">Player notes:</span> {profile.notes}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/45">
                          No player profile details saved yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row xl:items-center">
                    <form action={updateSquadMemberRoleAction} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="teamid" value={teamid} />
                      <input type="hidden" name="membershipId" value={member.id} />
                      <div className="min-w-[220px]">
                        <FormListboxField
                          name="role"
                          value={member.role}
                          options={roleOptions}
                          placeholder="Select role"
                        />
                      </div>
                      <button
                        type="submit"
                        className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                      >
                        Update role
                      </button>
                    </form>

                    <EditPlayerButton href={`/captain/team/${teamid}/squad/${member.id}/edit`} />

                    {canOpenAdminComms ? (
                      <CommunicationButton
                        href={`/admin/teams/${teamid}/players/${member.id}/communications`}
                        label="Player comms"
                      />
                    ) : null}

                    <form action={removeSquadMemberAction}>
                      <input type="hidden" name="teamid" value={teamid} />
                      <input type="hidden" name="membershipId" value={member.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/15"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}

            {pendingSquadProspects.length > 0 ? (
              <div id="pending-activation" className="scroll-mt-8 px-6 py-5">
                <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                        Pending activation
                      </p>
                      <p className="mt-1 text-sm text-amber-100">
                        These players have been promoted to the squad but do not yet have a linked SIXFL account.
                      </p>
                    </div>
                    <Link
                      href={`/captain/team/${teamid}/prospects`}
                      className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                    >
                      Manage prospects
                    </Link>
                  </div>

                  <div className="mt-4 space-y-3">
                    {pendingSquadProspects.map((prospect) => {
                      const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim();
                      const hasEmail = Boolean(prospect.email?.trim());
                      const latestActivationDispatch = activationDispatchByProspectId.get(prospect.id);
                      const latestActivationSmsDispatch = activationSmsDispatchByProspectId.get(prospect.id);
                      const latestResponse = latestResponseByProspectId.get(prospect.id);
                      const hasActivationEmailBeenQueued = Boolean(latestActivationDispatch);

                      return (
                        <div
                          key={prospect.id}
                          className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 xl:flex-row xl:items-center xl:justify-between"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white/70">
                              {getInitials(fullName, prospect.email)}
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-base font-semibold text-white">
                                  {fullName || "Unnamed prospect"}
                                </div>
                                <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                                  Pending account
                                </span>
                                {isManagedTeam ? <PlayerResponseBadge response={latestResponse} /> : null}
                                {latestActivationDispatch ? (
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getActivationStatusClasses(latestActivationDispatch.status)}`}>
                                    {getActivationBadgeLabel(latestActivationDispatch.status)}
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-2 text-sm text-white/70">
                                {prospect.email || "No email saved"}
                                {prospect.phone ? ` · ${prospect.phone}` : ""}
                              </div>

                              <div className="mt-1 text-xs text-white/45">
                                Promoted {formatUkDateTime(prospect.updatedAt)}
                              </div>

                              {latestActivationDispatch ? (
                                <div className={`mt-2 rounded-xl border px-3 py-2 text-xs font-medium ${getActivationStatusClasses(latestActivationDispatch.status)}`}>
                                  {getActivationStatusText({ label: "Activation email", ...latestActivationDispatch })}
                                </div>
                              ) : (
                                <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/50">
                                  No activation account email sent yet.
                                </div>
                              )}

                              {latestActivationSmsDispatch ? (
                                <div className={`mt-2 rounded-xl border px-3 py-2 text-xs font-medium ${getActivationStatusClasses(latestActivationSmsDispatch.status)}`}>
                                  {getActivationStatusText({ label: "SMS chase", ...latestActivationSmsDispatch })}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 xl:justify-end">
                            <Link
                              href={`/captain/team/${teamid}/prospects`}
                              className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/10"
                            >
                              Edit in prospects
                            </Link>
                            {canOpenAdminComms ? (
                              <CommunicationButton
                                href={`/admin/teams/${teamid}/prospects/${prospect.id}/communications`}
                                label="Prospect comms"
                              />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Add squad member
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Attach an existing user</h2>
            <p className="mt-2 text-sm text-white/55">
              Add a player by email address. They need a SIXFL account before they can be attached here.
            </p>
            <form action={addSquadMemberAction} className="mt-5 space-y-4">
              <input type="hidden" name="teamid" value={teamid} />
              <label className="block space-y-2 text-sm font-medium text-white/65">
                <span>Email address</span>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="player@example.com"
                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50 focus:bg-black/35"
                />
              </label>
              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
              >
                Add member
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
              Captain access
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Claim and invite status</h2>
            <div className="mt-4 space-y-3 text-sm text-amber-100/80">
              <div>
                <span className="text-white/55">Primary contact:</span> {team.contactName || "No name"} · {team.contactEmail || "No email"}
              </div>
              <div>
                <span className="text-white/55">Phone:</span> {team.contactPhone || "No phone"}
              </div>
              {team.secondaryContactEmail ? (
                <div>
                  <span className="text-white/55">Secondary:</span> {team.secondaryContactName || "No name"} · {team.secondaryContactEmail}
                </div>
              ) : null}
              <div>
                <span className="text-white/55">Invite sent:</span> {team.captainInviteSentAt ? formatUkDateTime(team.captainInviteSentAt) : "Not sent"}
              </div>
              <div>
                <span className="text-white/55">Claimed:</span> {team.captainClaimedAt ? formatUkDateTime(team.captainClaimedAt) : "Not claimed"}
              </div>
              <div>
                <span className="text-white/55">Linked:</span> {team.captainLinkedAt ? formatUkDateTime(team.captainLinkedAt) : "Not linked"}
                {team.captainLinkedSource ? ` · ${team.captainLinkedSource}` : ""}
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
