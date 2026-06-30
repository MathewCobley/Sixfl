// ========================================
// File: src/components/admin/people/LinkedRoleLinks.tsx
// ========================================

import Link from "next/link";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type LinkedRoleLinksProps = {
  userId: string;
  current: "player" | "referee";
};

function formatRole(role: string) {
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
    default:
      return "Player";
  }
}

function formatLeague(league: { name: string; season: string | null } | null) {
  if (!league) return "No league assigned";
  return `${league.name}${league.season ? ` · ${league.season}` : ""}`;
}

export default async function LinkedRoleLinks({ userId, current }: LinkedRoleLinksProps) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  if (!user) return null;

  if (current === "player") {
    if (user.role !== UserRole.REFEREE) return null;

    return (
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Also linked as referee</div>
            <h2 className="mt-2 text-xl font-semibold text-white">{user.name || user.email || "This player"} has referee access</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/75">
              Player messages stay on this page, while referee messages stay in the referee timeline.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/admin/referees/${user.id}`} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10">
              Referee profile
            </Link>
            <Link href={`/admin/messages/referees/${user.id}`} className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black transition hover:bg-emerald-300">
              Referee comms
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      role: true,
      team: {
        select: {
          id: true,
          name: true,
          league: {
            select: {
              name: true,
              season: true,
            },
          },
        },
      },
    },
  });

  if (memberships.length === 0) return null;

  return (
    <section className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">Also linked as player</div>
          <h2 className="mt-2 text-xl font-semibold text-white">{user.name || user.email || "This referee"} also has player records</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-50/75">
            Referee messages stay here. Use the player links below for squad availability, match fee, prospect and team-member communications.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {memberships.map((membership) => (
          <div key={membership.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">{membership.team.name}</div>
                <div className="mt-1 text-xs text-white/55">{formatLeague(membership.team.league)}</div>
                <div className="mt-2 inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/65">
                  {formatRole(membership.role)}
                </div>
              </div>
              <Link href={`/admin/teams/${membership.team.id}/players/${membership.id}/communications`} className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-sky-300 px-4 text-sm font-semibold text-black transition hover:bg-sky-200">
                Player comms
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
