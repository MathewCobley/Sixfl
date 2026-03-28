// ========================================
// File: src/app/admin/captains/page.tsx
// ========================================

"use server";

// ========================================
// Imports
// ========================================

import Link from "next/link";
import { TeamRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

// ========================================
// Helpers
// ========================================

function buildClaimUrl(claimCode: string) {
  return `/teams/claim/${claimCode}`;
}

// ========================================
// Page
// ========================================

export default async function AdminCaptainsPage() {
  await requireAdmin();

  const captainMemberships = await prisma.teamMember.findMany({
    where: {
      role: TeamRole.CAPTAIN,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          createdFromLeadId: true,
        },
      },
      team: {
        include: {
          league: {
            select: {
              id: true,
              name: true,
              slug: true,
              season: true,
              isActive: true,
            },
          },
        },
      },
    },
    orderBy: [
      { team: { league: { name: "asc" } } },
      { team: { name: "asc" } },
      { createdAt: "desc" },
    ],
  });

  const teamsWithoutCaptain = await prisma.team.findMany({
    where: {
      members: {
        none: {
          role: TeamRole.CAPTAIN,
        },
      },
    },
    include: {
      league: {
        select: {
          id: true,
          name: true,
          slug: true,
          season: true,
          isActive: true,
        },
      },
      createdByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      _count: {
        select: {
          members: true,
        },
      },
    },
    orderBy: [{ league: { name: "asc" } }, { name: "asc" }],
  });

  const totalCaptains = captainMemberships.length;
  const missingCaptainCount = teamsWithoutCaptain.length;
  const activeCaptainCount = captainMemberships.filter(
    (item) => item.team.league?.isActive,
  ).length;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.24em] text-emerald-400/80">
          Admin
        </p>
        <h1 className="text-3xl font-semibold text-white">Captains</h1>
        <p className="text-sm text-white/60">
          View league captains, account status, claim flow coverage, and teams still
          missing a proper captain record.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">
            Captain records
          </p>
          <p className="mt-2 text-3xl font-semibold text-white">{totalCaptains}</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">
            Active league captains
          </p>
          <p className="mt-2 text-3xl font-semibold text-white">{activeCaptainCount}</p>
        </div>

        <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-red-200/70">
            Teams missing captain
          </p>
          <p className="mt-2 text-3xl font-semibold text-white">{missingCaptainCount}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Captain records</h2>
        </div>

        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-white/5">
            <tr className="text-left text-xs uppercase tracking-[0.18em] text-white/45">
              <th className="px-5 py-4">Captain</th>
              <th className="px-5 py-4">Email</th>
              <th className="px-5 py-4">Team</th>
              <th className="px-5 py-4">League</th>
              <th className="px-5 py-4">Claim</th>
              <th className="px-5 py-4">Created</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/10">
            {captainMemberships.map((membership) => {
              const captainName = membership.user.name?.trim() || "Unnamed captain";
              const captainEmail = membership.user.email?.trim() || "No email";
              const leagueName = membership.team.league?.name || "Unassigned";
              const leagueSeason = membership.team.league?.season || null;

              return (
                <tr key={membership.id} className="text-sm text-white/85">
                  <td className="px-5 py-4">
                    <div className="font-medium text-white">{captainName}</div>
                    <div className="text-xs text-white/45">
                      User ID: {membership.user.id}
                    </div>
                  </td>

                  <td className="px-5 py-4 text-white/70">{captainEmail}</td>

                  <td className="px-5 py-4">
                    <div className="font-medium text-white">{membership.team.name}</div>
                    <div className="text-xs text-white/45">
                      Claim code: {membership.team.claimCode}
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <div>{leagueName}</div>
                    <div className="text-xs text-white/45">{leagueSeason ?? "—"}</div>
                  </td>

                  <td className="px-5 py-4">
                    <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                      Captain linked
                    </span>
                  </td>

                  <td className="px-5 py-4 text-white/60">
                    {membership.createdAt.toLocaleDateString("en-GB")}
                  </td>

                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/admin/teams/${membership.team.id}`}
                        className="text-emerald-300 hover:text-emerald-200"
                      >
                        Team
                      </Link>

                      {membership.team.league?.slug ? (
                        <Link
                          href={`/leagues/${membership.team.league.slug}`}
                          className="text-emerald-300 hover:text-emerald-200"
                        >
                          League
                        </Link>
                      ) : null}

                      <Link
                        href={buildClaimUrl(membership.team.claimCode)}
                        className="text-emerald-300 hover:text-emerald-200"
                      >
                        Claim link
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}

            {captainMemberships.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-white/50">
                  No captain records found yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-3xl border border-red-500/20 bg-red-500/10">
        <div className="border-b border-red-500/20 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Teams missing a captain</h2>
          <p className="mt-1 text-sm text-red-100/75">
            These teams have no TeamMember with the CAPTAIN role.
          </p>
        </div>

        <table className="min-w-full divide-y divide-red-500/15">
          <thead className="bg-red-500/5">
            <tr className="text-left text-xs uppercase tracking-[0.18em] text-red-100/60">
              <th className="px-5 py-4">Team</th>
              <th className="px-5 py-4">League</th>
              <th className="px-5 py-4">Created by</th>
              <th className="px-5 py-4">Members</th>
              <th className="px-5 py-4">Claim code</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-red-500/15">
            {teamsWithoutCaptain.map((team) => (
              <tr key={team.id} className="text-sm text-white/85">
                <td className="px-5 py-4 font-medium text-white">{team.name}</td>
                <td className="px-5 py-4">
                  <div>{team.league?.name ?? "Unassigned"}</div>
                  <div className="text-xs text-white/45">{team.league?.season ?? "—"}</div>
                </td>
                <td className="px-5 py-4">
                  <div>{team.createdByUser?.name ?? "No creator linked"}</div>
                  <div className="text-xs text-white/45">
                    {team.createdByUser?.email ?? "—"}
                  </div>
                </td>
                <td className="px-5 py-4">{team._count.members}</td>
                <td className="px-5 py-4 text-white/70">{team.claimCode}</td>
                <td className="px-5 py-4 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/teams/${team.id}`}
                      className="text-red-100 hover:text-white"
                    >
                      Fix team
                    </Link>
                    <Link
                      href={buildClaimUrl(team.claimCode)}
                      className="text-red-100 hover:text-white"
                    >
                      Claim link
                    </Link>
                  </div>
                </td>
              </tr>
            ))}

            {teamsWithoutCaptain.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-red-100/75">
                  Every current team has a captain record.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}