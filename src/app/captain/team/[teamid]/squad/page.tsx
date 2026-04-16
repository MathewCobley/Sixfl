// ========================================
// File: src/app/captain/team/[teamid]/squad/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
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

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "member-added":
      return "Squad member added.";
    case "role-updated":
      return "Squad role updated.";
    case "member-removed":
      return "Squad member removed.";
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
    },
  });

  if (!team) {
    notFound();
  }

  const captainCount = team.members.filter((member) => member.role === "CAPTAIN").length;
  const managerCount = team.members.filter((member) => member.role === "MANAGER").length;
  const playerCount = team.members.filter((member) => member.role === "PLAYER").length;
  const coachCount = team.members.filter((member) => member.role === "COACH").length;

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
                {team.members.length} squad member{team.members.length === 1 ? "" : "s"}
              </span>
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
                Players
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{playerCount}</p>
              <p className="mt-2 text-sm text-white/65">Standard player memberships.</p>
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
              {team.members.length} total
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {team.members.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No squad members are attached to this team yet.
              </div>
            ) : (
              team.members.map((member) => (
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
                        Added {member.createdAt.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row xl:items-center">
                    <form action={updateSquadMemberRoleAction} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="teamid" value={teamid} />
                      <input type="hidden" name="membershipId" value={member.id} />

                      <select
                        name="role"
                        defaultValue={member.role}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500/60"
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

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
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
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

              <div className="space-y-2">
                <label htmlFor="role" className="text-sm text-white/60">
                  Role
                </label>
                <select
                  id="role"
                  name="role"
                  defaultValue="PLAYER"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

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
                  {team.captainLinkedAt ? team.captainLinkedAt.toLocaleString() : "—"}
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
                  {team.captainInviteSentAt ? team.captainInviteSentAt.toLocaleString() : "—"}
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
                  {team.captainClaimedAt ? team.captainClaimedAt.toLocaleString() : "—"}
                </span>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}