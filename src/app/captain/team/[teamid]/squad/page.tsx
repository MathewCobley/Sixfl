// ========================================
// File: src/app/captain/team/[teamid]/squad/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationDispatchStatus, TeamRole } from "@prisma/client";

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

function getActivationEmailBadgeLabel(status?: NotificationDispatchStatus) {
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

function getActivationEmailStatusText(input: {
  status: NotificationDispatchStatus;
  createdAt: Date;
  scheduledFor: Date;
  sentAt: Date | null;
  failedAt: Date | null;
}) {
  switch (input.status) {
    case "SENT":
      return `Activation email sent ${formatUkDateTime(input.sentAt ?? input.createdAt)}`;
    case "QUEUED":
      return `Activation email queued ${formatUkDateTime(input.scheduledFor ?? input.createdAt)}`;
    case "PROCESSING":
      return `Activation email is being processed (${formatUkDateTime(input.createdAt)})`;
    case "FAILED":
      return `Activation email failed ${formatUkDateTime(input.failedAt ?? input.createdAt)}`;
    case "SKIPPED":
      return `Activation email skipped ${formatUkDateTime(input.createdAt)}`;
    case "CANCELLED":
      return `Activation email cancelled ${formatUkDateTime(input.createdAt)}`;
    default:
      return `Activation email queued ${formatUkDateTime(input.createdAt)}`;
  }
}

function getActivationEmailStatusClasses(status?: NotificationDispatchStatus) {
  if (status === "FAILED" || status === "SKIPPED" || status === "CANCELLED") {
    return "border-red-400/20 bg-red-500/10 text-red-100";
  }

  if (status === "SENT") {
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }

  return "border-sky-400/20 bg-sky-500/10 text-sky-100";
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

  const profileByMemberId = await getTeamMemberProfilesByTeamMemberIds(
    team.members.map((member) => member.id),
  );

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

  const latestActivationDispatches = pendingSquadProspects.length
    ? await prisma.notificationDispatch.findMany({
        where: {
          sourceType: "TEAM_PLAYER_PROSPECT",
          sourceId: {
            in: pendingSquadProspects.map((prospect) => prospect.id),
          },
          template: {
            is: {
              key: "squad-activation-email",
            },
          },
        },
        select: {
          sourceId: true,
          status: true,
          createdAt: true,
          scheduledFor: true,
          sentAt: true,
          failedAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      })
    : [];

  const activationDispatchByProspectId = new Map<
    string,
    (typeof latestActivationDispatches)[number]
  >();

  for (const dispatch of latestActivationDispatches) {
    if (dispatch.sourceId && !activationDispatchByProspectId.has(dispatch.sourceId)) {
      activationDispatchByProspectId.set(dispatch.sourceId, dispatch);
    }
  }

  const captainCount = team.members.filter((member) => member.role === "CAPTAIN").length;
  const managerCount = team.members.filter((member) => member.role === "MANAGER").length;
  const playerCount = team.members.filter((member) => member.role === "PLAYER").length;
  const coachCount = team.members.filter((member) => member.role === "COACH").length;
  const totalSquadCount = team.members.length + pendingSquadProspects.length;
  const savedMessage = getSavedMessage(filters.saved);
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
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
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            {[
              { label: "Captains", value: captainCount, copy: "Linked captain roles in squad.", tone: "amber" },
              { label: "Managers", value: managerCount, copy: "Organisers and managers attached.", tone: "emerald" },
              { label: "Linked players", value: playerCount, copy: "Players with a SIXFL account.", tone: "white" },
              { label: "Coaches", value: coachCount, copy: "Coach roles currently assigned.", tone: "sky" },
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
                <div key={metric.label} className={`rounded-[1.5rem] border p-5 ${toneClasses}`}>
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
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
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

                    {canOpenAdminComms && profile?.sourceProspectId ? (
                      <CommunicationButton
                        href={`/admin/teams/${teamid}/prospects/${profile.sourceProspectId}/communications`}
                      />
                    ) : canOpenAdminComms ? (
                      <CommunicationButton href={`/admin/teams/${teamid}/communications`} label="Team comms" />
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
                <div className="rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 p-4">
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
                                {latestActivationDispatch ? (
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getActivationEmailStatusClasses(latestActivationDispatch.status)}`}>
                                    {getActivationEmailBadgeLabel(latestActivationDispatch.status)}
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
                                <div className={`mt-2 rounded-xl border px-3 py-2 text-xs font-medium ${getActivationEmailStatusClasses(latestActivationDispatch.status)}`}>
                                  {getActivationEmailStatusText(latestActivationDispatch)}
                                </div>
                              ) : (
                                <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/50">
                                  No activation account email sent yet.
                                </div>
                              )}

                              {prospect.notes ? (
                                <div className="mt-2 text-sm text-white/55">{prospect.notes}</div>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-3 xl:justify-end">
                            <form method="post" action={`/captain/team/${teamid}/squad/send-activation`}>
                              <input type="hidden" name="prospectId" value={prospect.id} />
                              <button
                                type="submit"
                                disabled={!hasEmail}
                                className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
                              >
                                {hasActivationEmailBeenQueued ? "Send again" : "Send activation email"}
                              </button>
                            </form>
                            <form method="post" action={`/captain/team/${teamid}/squad/send-activation-sms`}>
                              <input type="hidden" name="prospectId" value={prospect.id} />
                              <button
                                type="submit"
                                disabled={!prospect.phone}
                                className="inline-flex items-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
                              >
                                Chase by SMS
                              </button>
                            </form>
                            
                            {canOpenAdminComms ? (
                              <CommunicationButton
                                href={`/admin/teams/${teamid}/prospects/${prospect.id}/communications`}
                              />
                            ) : null}

                            <Link
                              href={`/captain/team/${teamid}/prospects`}
                              className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                            >
                              Open prospect
                            </Link>
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
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Communications
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Use the communications hub</h2>
            <p className="mt-2 text-sm text-white/60">
              Squad emails and player outreach now live in Communications so the message history, replies and templates stay in one place.
            </p>

            {canOpenAdminComms ? (
              <div className="mt-5 space-y-3">
                <Link
                  href={`/admin/teams/${teamid}/communications`}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                >
                  Open team communications
                </Link>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                  Use the individual <span className="text-white/80">Comms</span> buttons beside players for one-to-one player/prospect messages.
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
                Messaging is managed from the central communications area.
              </div>
            )}
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Add existing user
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Add squad member</h2>
            <p className="mt-2 text-sm text-white/60">
              This uses an existing SIXFL user account. Add them by email, then choose the role.
            </p>

            <form action={addSquadMemberAction} className="mt-5 space-y-4">
              <input type="hidden" name="teamid" value={teamid} />

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm text-white/60">
                  User email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="player@example.com"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                />
              </div>

              <FormListboxField
                name="role"
                label="Role"
                value="PLAYER"
                options={roleOptions}
                placeholder="Select role"
              />

              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Add to squad
              </button>
            </form>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Team contacts
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Contact snapshot</h2>

            <div className="mt-5 space-y-4 text-sm text-white/75">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  Primary
                </div>
                <div className="mt-3 space-y-2">
                  <div><span className="text-white/45">Name:</span> {team.contactName || "—"}</div>
                  <div><span className="text-white/45">Email:</span> {team.contactEmail || "—"}</div>
                  <div><span className="text-white/45">Phone:</span> {team.contactPhone || "—"}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  Secondary
                </div>
                <div className="mt-3 space-y-2">
                  <div><span className="text-white/45">Name:</span> {team.secondaryContactName || "—"}</div>
                  <div><span className="text-white/45">Email:</span> {team.secondaryContactEmail || "—"}</div>
                  <div><span className="text-white/45">Phone:</span> {team.secondaryContactPhone || "—"}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Captain access
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Claim status</h2>

            <div className="mt-5 space-y-3 text-sm text-white/75">
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/50">Captain linked</span>
                <span className="text-right text-white">{team.captainLinkedAt ? formatUkDateTime(team.captainLinkedAt) : "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/50">Linked source</span>
                <span className="text-right text-white">{team.captainLinkedSource || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/50">Invite sent</span>
                <span className="text-right text-white">{team.captainInviteSentAt ? formatUkDateTime(team.captainInviteSentAt) : "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/50">Invite email</span>
                <span className="text-right text-white">{team.captainInviteSentTo || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/50">Claimed at</span>
                <span className="text-right text-white">{team.captainClaimedAt ? formatUkDateTime(team.captainClaimedAt) : "—"}</span>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
