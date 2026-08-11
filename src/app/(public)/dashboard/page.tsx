// ========================================
// File: src/app/dashboard/page.tsx
// ========================================

import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { TeamMode, TeamRole, UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getTeamRedirectPath(input: {
  teamId: string;
  role: TeamRole;
  teamMode: TeamMode;
}) {
  if (input.teamMode === TeamMode.MANAGED) {
    return `/player/team/${input.teamId}`;
  }

  if (input.role === TeamRole.CAPTAIN || input.role === TeamRole.MANAGER) {
    return `/captain/team/${input.teamId}`;
  }

  return `/player/team/${input.teamId}`;
}

function getTeamRoleLabel(role: TeamRole) {
  if (role === TeamRole.CAPTAIN) return "Captain";
  if (role === TeamRole.MANAGER) return "Manager";
  if (role === TeamRole.VICE_CAPTAIN) return "Vice captain";
  if (role === TeamRole.BACKUP_PLAYER) return "Backup player";
  if (role === TeamRole.COACH) return "Coach";
  return "Player";
}

function TeamChoiceCard({
  membership,
}: {
  membership: {
    teamId: string;
    role: TeamRole;
    team: {
      id: string;
      name: string;
      teamMode: TeamMode;
      league: {
        name: string;
        season: string | null;
      } | null;
    };
  };
}) {
  return (
    <Link
      href={getTeamRedirectPath({
        teamId: membership.teamId,
        role: membership.role,
        teamMode: membership.team.teamMode,
      })}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-emerald-400/30 hover:bg-emerald-500/10"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold text-white">
            {membership.team.name}
          </div>
          <div className="mt-1 text-sm text-white/55">
            {membership.team.league?.name ?? "No league assigned"}
            {membership.team.league?.season
              ? ` · ${membership.team.league.season}`
              : ""}
          </div>
        </div>
        <span className="inline-flex w-fit rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
          {getTeamRoleLabel(membership.role)}
        </span>
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const email = session.user.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      teamMembers: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          teamId: true,
          role: true,
          team: {
            select: {
              id: true,
              name: true,
              teamMode: true,
              league: {
                select: {
                  name: true,
                  season: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  if (user.role === UserRole.ADMIN) {
    redirect("/admin");
  }

  const primaryMembership =
    user.teamMembers.find(
      (membership) =>
        membership.role === TeamRole.CAPTAIN || membership.role === TeamRole.MANAGER,
    ) ?? user.teamMembers[0] ?? null;
  const isReferee = user.role === UserRole.REFEREE;
  const hasTeamAccess = user.teamMembers.length > 0;

  if (isReferee && hasTeamAccess) {
    return (
      <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              SIXFL account
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              Choose where you want to go
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/70">
              This email is linked as both a referee and a player/captain. Choose the area you want to open.
            </p>
          </section>

          <section className="grid gap-3">
            <Link
              href="/referee"
              className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-5 transition hover:border-sky-400/35 hover:bg-sky-500/15"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">
                    Referee dashboard
                  </div>
                  <div className="mt-1 text-sm text-white/55">
                    Open referee nights, availability, rules and cashup.
                  </div>
                </div>
                <span className="inline-flex w-fit rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-100">
                  Referee
                </span>
              </div>
            </Link>

            {user.teamMembers.map((membership) => (
              <TeamChoiceCard
                key={`${membership.teamId}-${membership.role}`}
                membership={membership}
              />
            ))}
          </section>
        </div>
      </main>
    );
  }

  if (primaryMembership && user.teamMembers.length === 1) {
    redirect(
      getTeamRedirectPath({
        teamId: primaryMembership.teamId,
        role: primaryMembership.role,
        teamMode: primaryMembership.team.teamMode,
      }),
    );
  }

  if (primaryMembership && user.teamMembers.length > 1) {
    return (
      <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              SIXFL account
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              Choose a team
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/70">
              You are linked to more than one SIXFL team. Choose the team area you want to open.
            </p>
          </section>

          <section className="grid gap-3">
            {user.teamMembers.map((membership) => (
              <TeamChoiceCard
                key={`${membership.teamId}-${membership.role}`}
                membership={membership}
              />
            ))}
          </section>
        </div>
      </main>
    );
  }

  if (isReferee) {
    redirect("/referee");
  }

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
          SIXFL account
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          No team area is linked yet
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/65">
          You are signed in as {user.email}, but this account is not currently linked to a SIXFL team area.
        </p>
        <Link
          href="/leagues"
          className="mt-5 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          View leagues
        </Link>
      </div>
    </main>
  );
}
