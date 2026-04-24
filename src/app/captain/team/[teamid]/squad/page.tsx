// ========================================
// File: src/app/captain/team/[teamid]/squad/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamRole } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import FormListboxField from "@/components/ui/FormListboxField";
import {
  addSquadMemberAction,
  removeSquadMemberAction,
  sendSquadEmailAction,
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

  const parts = base
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

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
    case "squad-email-sent":
      return "Squad email queued.";
    case "activation-email-sent":
      return "Activation email queued.";
    default:
      return saved ? "Saved." : null;
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

  await requireCaptain(teamid);

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

  if (!team) {
    notFound();
  }

  const linkedMemberEmails = new Set(
    team.members
      .map((member) => member.user.email?.trim().toLowerCase() ?? null)
      .filter((email): email is string => Boolean(email)),
  );

  const pendingSquadProspects = team.prospects.filter((prospect) => {
    const normalizedEmail = prospect.email?.trim().toLowerCase() ?? null;

    if (!normalizedEmail) {
      return true;
    }

    return !linkedMemberEmails.has(normalizedEmail);
  });

  const captainCount = team.members.filter((member) => member.role === "CAPTAIN").length;
  const managerCount = team.members.filter((member) => member.role === "MANAGER").length;
  const playerCount = team.members.filter((member) => member.role === "PLAYER").length;
  const coachCount = team.members.filter((member) => member.role === "COACH").length;
  const emailableMembers = team.members.filter((member) => Boolean(member.user.email?.trim()));

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
              Control who is attached to the team, assign roles, and keep your captain and
              organiser setup tidy.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {team.league?.name ?? "No league assigned"}
                {team.league?.season ? ` · ${team.league.season}` : ""}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                {team.members.length + pendingSquadProspects.length} squad player{team.members.length + pendingSquadProspects.length === 1 ? "" : "s"}
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
                href={`/captain/team/${teamid}/fixtures`}
                className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
              >
                Open fixtures
              </Link>

              <Link
                href={`/captain/team/${teamid}/prospects`}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                Open prospects
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            <div className="rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Captains
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{captainCount}</p>
              <p className="mt-2 text-sm text-amber-100/75">Linked captain roles in squad.</p>
            </div>

            <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
                Managers
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{managerCount}</p>
              <p className="mt-2 text-sm text-emerald-100/75">Organisers and managers attached.</p>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                Linked players
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{playerCount}</p>
              <p className="mt-2 text-sm text-white/65">Players with a SIXFL account.</p>
            </div>

            <div className="rounded-[1.5rem] border border-sky-400/20 bg-sky-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">
                Coaches
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{coachCount}</p>
              <p className="mt-2 text-sm text-sky-100/75">Coach roles currently assigned.</p>
            </div>
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
              {team.members.length + pendingSquadProspects.length} total
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {team.members.length === 0 && pendingSquadProspects.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No squad members are attached to this team yet.
              </div>
            ) : null}

            {team.members.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-5 px-6 py-5 xl:flex-row xl:items-center xl:justify-between"
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

                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getRoleBadgeClasses(
                          member.role,
                        )}`}
                      >
                        {getRoleLabel(member.role)}
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-white/65">
                      {member.user.email || "No email on account"}
                    </div>

                    <div className="mt-1 text-xs text-white/45">
                      Added {formatUkDateTime(member.createdAt)}
                    </div>
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
            ))}

            {pendingSquadProspects.length > 0 ? (
              <div className="px-6 py-5">
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
                              </div>

                              <div className="mt-2 text-sm text-white/70">
                                {prospect.email || "No email saved"}
                                {prospect.phone ? ` · ${prospect.phone}` : ""}
                              </div>

                              <div className="mt-1 text-xs text-white/45">
                                Promoted {formatUkDateTime(prospect.updatedAt)}
                              </div>

                              {prospect.notes ? (
                                <div className="mt-2 text-sm text-white/55">{prospect.notes}</div>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <form
                              method="post"
                              action={`/captain/team/${teamid}/squad/send-activation`}
                            >
                              <input type="hidden" name="prospectId" value={prospect.id} />
                              <button
                                type="submit"
                                disabled={!hasEmail}
                                className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
                              >
                                Send activation email
                              </button>
                            </form>

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
              Squad communications
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Email selected squad members</h2>
            <p className="mt-2 text-sm text-white/60">
              Pick specific linked squad members and queue one email per selected player. Squad SMS is not shown here yet because player mobile numbers are not stored on linked user accounts.
            </p>

            {team.members.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
                Add squad members first before sending squad communications.
              </div>
            ) : (
              <form action={sendSquadEmailAction} className="mt-5 space-y-4">
                <input type="hidden" name="teamid" value={teamid} />

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">Recipients</div>
                      <div className="mt-1 text-xs text-white/45">
                        {emailableMembers.length} member{emailableMembers.length === 1 ? "" : "s"} with email available
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {team.members.map((member) => {
                      const hasEmail = Boolean(member.user.email?.trim());
                      return (
                        <label
                          key={member.id}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${
                            hasEmail
                              ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                              : "border-white/5 bg-white/[0.03] text-white/35"
                          }`}
                        >
                          <input
                            type="checkbox"
                            name="memberIds"
                            value={member.id}
                            defaultChecked={hasEmail}
                            disabled={!hasEmail}
                            className="h-4 w-4 rounded border-white/20 bg-transparent"
                          />
                          <span>{member.user.name || member.user.email || "Unnamed user"}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            hasEmail
                              ? "bg-emerald-500/15 text-emerald-200"
                              : "bg-white/10 text-white/45"
                          }`}>
                            {hasEmail ? "ready" : "no email"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="squad-email-subject" className="text-sm text-white/60">
                    Subject
                  </label>
                  <input
                    id="squad-email-subject"
                    name="subject"
                    type="text"
                    placeholder="Update for {{firstName}}"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                  <div className="text-xs text-white/45">
                    Supported placeholders: {"{{firstName}}"}, {"{{fullName}}"}, {"{{teamName}}"}
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="squad-email-body" className="text-sm text-white/60">
                    Message
                  </label>
                  <textarea
                    id="squad-email-body"
                    name="body"
                    rows={7}
                    placeholder={"Hi {{firstName}},\n\nHere is an update from {{teamName}}.\n\nThanks,\nCaptain"}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  Queue squad email
                </button>
              </form>
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
                  <div>
                    <span className="text-white/45">Name:</span> {team.contactName || "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Email:</span> {team.contactEmail || "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Phone:</span> {team.contactPhone || "—"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  Secondary
                </div>
                <div className="mt-3 space-y-2">
                  <div>
                    <span className="text-white/45">Name:</span> {team.secondaryContactName || "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Email:</span> {team.secondaryContactEmail || "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Phone:</span> {team.secondaryContactPhone || "—"}
                  </div>
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
                <span className="text-right text-white">
                  {team.captainLinkedAt ? formatUkDateTime(team.captainLinkedAt) : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/50">Linked source</span>
                <span className="text-right text-white">
                  {team.captainLinkedSource || "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/50">Invite sent</span>
                <span className="text-right text-white">
                  {team.captainInviteSentAt ? formatUkDateTime(team.captainInviteSentAt) : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/50">Invite email</span>
                <span className="text-right text-white">
                  {team.captainInviteSentTo || "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/50">Claimed at</span>
                <span className="text-right text-white">
                  {team.captainClaimedAt ? formatUkDateTime(team.captainClaimedAt) : "—"}
                </span>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
