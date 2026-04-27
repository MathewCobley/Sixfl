// ========================================
// File: src/app/(admin)/admin/teams/[id]/squad/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamRole } from "@prisma/client";

import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  addAdminSquadMemberAction,
  removeAdminSquadMemberAction,
  updateAdminSquadMemberRoleAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Admin Team Squad | SIXFL",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

const roleOptions: { value: TeamRole; label: string }[] = [
  { value: "CAPTAIN", label: "Captain" },
  { value: "MANAGER", label: "Manager" },
  { value: "VICE_CAPTAIN", label: "Vice-captain" },
  { value: "PLAYER", label: "Player" },
  { value: "BACKUP_PLAYER", label: "Backup player" },
  { value: "COACH", label: "Coach" },
];

function getRoleLabel(role: TeamRole) {
  switch (role) {
    case "CAPTAIN":
      return "Captain";
    case "MANAGER":
      return "Manager";
    case "VICE_CAPTAIN":
      return "Vice-captain";
    case "PLAYER":
      return "Player";
    case "BACKUP_PLAYER":
      return "Backup player";
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

function getInitials(
  name: string | null | undefined,
  email: string | null | undefined,
) {
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
    default:
      return saved ? "Saved." : null;
  }
}

export default async function AdminTeamSquadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const { id } = await params;
  const filters = await searchParams;

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      teamMode: true,
      isRecruiting: true,
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
            },
          },
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const captainCount = team.members.filter(
    (member) => member.role === "CAPTAIN",
  ).length;
  const managerCount = team.members.filter(
    (member) => member.role === "MANAGER",
  ).length;
  const viceCaptainCount = team.members.filter(
    (member) => member.role === "VICE_CAPTAIN",
  ).length;
  const playerCount = team.members.filter(
    (member) => member.role === "PLAYER",
  ).length;
  const backupCount = team.members.filter(
    (member) => member.role === "BACKUP_PLAYER",
  ).length;

  const savedMessage = getSavedMessage(filters.saved);
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href={`/admin/teams/${team.id}`}
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to team
          </Link>

          <h1 className="text-3xl font-semibold text-white">
            {team.name} squad
          </h1>

          <p className="text-sm text-white/60">
            Admin control for team membership, leadership roles, and organiser
            structure.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/captain/team/${team.id}/squad`}
            className="inline-flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
          >
            Captain squad view
          </Link>

          <Link
            href={`/admin/teams/${team.id}/prospects`}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Open prospects
          </Link>
        </div>
      </div>

      {savedMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {savedMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Team structure
            </p>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Squad overview
            </h2>

            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Review all team members, rebalance roles, and step in quickly if a
              managed team needs admin help.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {team.league?.name ?? "No league assigned"}
                {team.league?.season ? ` · ${team.league.season}` : ""}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                {team.teamMode}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                Recruiting: {team.isRecruiting ? "On" : "Off"}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Captains
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {captainCount}
              </p>
            </div>

            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
                Managers
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {managerCount}
              </p>
            </div>

            <div className="rounded-3xl border border-violet-400/20 bg-violet-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/70">
                Vice-captains
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {viceCaptainCount}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                Players
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {playerCount + backupCount}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Current squad
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Members and roles
              </h2>
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
                        Added {formatUkDateTime(member.createdAt)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row xl:items-center">
                    <form
                      action={updateAdminSquadMemberRoleAction}
                      className="flex flex-wrap items-center gap-3"
                    >
                      <input type="hidden" name="teamId" value={team.id} />
                      <input
                        type="hidden"
                        name="membershipId"
                        value={member.id}
                      />

                      <div className="min-w-[240px]">
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

                    <form action={removeAdminSquadMemberAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input
                        type="hidden"
                        name="membershipId"
                        value={member.id}
                      />
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
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Add existing user
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Add squad member
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Add an existing SIXFL account into this team and assign the right
              role immediately.
            </p>

            <form action={addAdminSquadMemberAction} className="mt-5 space-y-4">
              <input type="hidden" name="teamId" value={team.id} />

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

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Quick links
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <Link
                href={`/admin/teams/${team.id}`}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Back to team
              </Link>

              <Link
                href={`/admin/teams/${team.id}/prospects`}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Open prospects
              </Link>

              <Link
                href={`/captain/team/${team.id}/squad`}
                className="inline-flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
              >
                Open captain squad view
              </Link>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
