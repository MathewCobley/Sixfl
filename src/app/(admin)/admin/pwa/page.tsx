import Link from "next/link";
import { TeamMode, UserRole } from "@prisma/client";

import PwaDiagnosticsPanel from "@/components/admin/PwaDiagnosticsPanel";
import type { PwaViewerData } from "@/components/admin/pwa/PwaViewerPicker";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "PWA / Phone Preview | SIXFL Admin" };

function leagueLabel(input: { league: { name: string; season: string | null } | null }) {
  if (!input.league) return "No league assigned";
  return input.league.season ? `${input.league.name} · ${input.league.season}` : input.league.name;
}

function personLabel(input: { name: string | null; email: string | null }) {
  return input.name?.trim() || input.email?.trim() || "Unnamed user";
}

/** Advanced browser preview stays separate from the fixed /admin/test-apps launcher.
 * Resolve identities only after administrator authorisation; the existing preview
 * routes perform their own access checks before opening any real portal. */
export default async function AdminPwaDiagnosticsPage() {
  await requireAdmin();

  const [teams, referees] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true, name: true, logoUrl: true, teamMode: true,
        league: { select: { name: true, season: true } },
        members: {
          orderBy: [{ createdAt: "asc" }],
          select: {
            id: true, role: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: UserRole.REFEREE },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  const viewerData: PwaViewerData = {
    captainTeams: teams.filter(team => team.teamMode === TeamMode.STANDARD).map(team => ({
      id: team.id, name: team.name, leagueLabel: leagueLabel(team), logoUrl: team.logoUrl,
    })),
    playerTeams: teams.filter(team => team.members.length > 0).map(team => ({
      id: team.id, name: team.name, leagueLabel: leagueLabel(team), logoUrl: team.logoUrl,
      players: team.members.map(membership => ({
        membershipId: membership.id, name: personLabel(membership.user), role: membership.role,
      })).sort((a, b) => a.name.localeCompare(b.name)),
    })),
    referees: referees.map(referee => ({ id: referee.id, name: personLabel(referee), email: referee.email })),
  };

  return (
    <div className="w-full px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/60">PC testing: choose any team, player or referee below.</p>
        <Link href="/admin/test-apps" className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/15">
          Open fixed Test apps
        </Link>
      </div>
      <PwaDiagnosticsPanel viewerData={viewerData} />
    </div>
  );
}
