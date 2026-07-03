// ========================================
// File: src/app/(admin)/admin/audits/team-memberships/page.tsx
// ========================================

import Link from "next/link";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamMembershipAuditPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function TeamMembershipAuditPage({ searchParams }: TeamMembershipAuditPageProps) {
  await requireAdmin();

  const params = searchParams ? await searchParams : {};
  const email = getSearchParam(params.email).trim().toLowerCase();
  const teamId = getSearchParam(params.teamId).trim();
  const teamName = getSearchParam(params.teamName).trim();

  const where = {
    ...(email
      ? {
          user: {
            email: {
              equals: email,
              mode: "insensitive" as const,
            },
          },
        }
      : {}),
    ...(teamId ? { teamId } : {}),
    ...(teamName
      ? {
          team: {
            name: {
              contains: teamName,
              mode: "insensitive" as const,
            },
          },
        }
      : {}),
  };

  const memberships = email || teamId || teamName
    ? await prisma.teamMember.findMany({
        where,
        orderBy: [{ createdAt: "asc" }],
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
          team: {
            select: {
              id: true,
              name: true,
              contactName: true,
              contactEmail: true,
              contactPhone: true,
              captainUserId: true,
              captainLinkedAt: true,
              captainClaimedAt: true,
              league: {
                select: {
                  id: true,
                  name: true,
                  season: true,
                  competition: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
              division: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      })
    : [];

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Read-only audit
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Team membership audit
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          This page only reads TeamMember links. Use it to confirm whether a player/captain is attached to the wrong team before removing anything.
        </p>

        <form className="mt-6 grid gap-3 md:grid-cols-3" action="/admin/audits/team-memberships">
          <input
            name="email"
            defaultValue={email}
            placeholder="email@example.com"
            className="h-12 rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
          />
          <input
            name="teamName"
            defaultValue={teamName}
            placeholder="Team name"
            className="h-12 rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
          />
          <input
            name="teamId"
            defaultValue={teamId}
            placeholder="Team ID"
            className="h-12 rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
          />
          <button className="h-12 rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300 md:col-span-3">
            Search memberships
          </button>
        </form>
      </AdminCard>

      <AdminCard className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-0">
        <div className="border-b border-white/10 px-6 py-5 md:px-8">
          <h2 className="text-xl font-semibold text-white">Results</h2>
          <p className="mt-1 text-sm text-white/45">{memberships.length} membership link{memberships.length === 1 ? "" : "s"} found.</p>
        </div>

        {memberships.length === 0 ? (
          <div className="p-6 text-sm text-white/55">No membership links found for that search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1400px] text-left text-sm">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.16em] text-white/40">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Membership</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">League / division</th>
                  <th className="px-4 py-3">Team contact</th>
                  <th className="px-4 py-3">Captain state</th>
                  <th className="px-4 py-3">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {memberships.map((membership) => (
                  <tr key={membership.id} className="bg-black/10">
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold text-white">{membership.user.name ?? "No name"}</div>
                      <div className="text-white/55">{membership.user.email ?? "No email"}</div>
                      <div className="mt-1 font-mono text-[11px] text-white/35">{membership.user.id}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold text-white">{membership.role}</div>
                      <div className="text-white/45">Added {formatDate(membership.createdAt)}</div>
                      <div className="mt-1 font-mono text-[11px] text-white/35">{membership.id}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold text-white">{membership.team.name}</div>
                      <div className="mt-1 font-mono text-[11px] text-white/35">{membership.team.id}</div>
                    </td>
                    <td className="px-4 py-4 align-top text-white/65">
                      <div>{membership.team.league?.name ?? "No league"}</div>
                      <div className="text-white/40">{membership.team.league?.season ?? "No season"}</div>
                      <div className="text-sky-200/70">{membership.team.division?.name ?? "No division"}</div>
                      <div className="mt-1 text-white/35">{membership.team.league?.competition?.name ?? "No competition"}</div>
                    </td>
                    <td className="px-4 py-4 align-top text-white/65">
                      <div>{membership.team.contactName ?? "—"}</div>
                      <div>{membership.team.contactEmail ?? "—"}</div>
                      <div className="text-white/40">{membership.team.contactPhone ?? "—"}</div>
                    </td>
                    <td className="px-4 py-4 align-top text-white/65">
                      <div className="font-mono text-[11px]">captainUserId: {membership.team.captainUserId ?? "—"}</div>
                      <div className="text-white/40">Linked {formatDate(membership.team.captainLinkedAt)}</div>
                      <div className="text-white/40">Claimed {formatDate(membership.team.captainClaimedAt)}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-col gap-2">
                        <Link href={`/admin/teams/${membership.team.id}`} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-xs font-semibold text-white/75 hover:bg-white/[0.08]">Admin team</Link>
                        <Link href={`/captain/team/${membership.team.id}/squad`} className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold text-emerald-100 hover:bg-emerald-500/15">Squad</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
