// ========================================
// File: src/app/captain/team/[teamid]/layout.tsx
// ========================================

import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export default async function CaptainTeamLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      teamMode: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          isActive: true,
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const navItems = [
    { href: `/captain/team/${teamid}`, label: "Overview" },
    { href: `/captain/team/${teamid}/squad`, label: "Squad" },
    ...(team.teamMode === "MANAGED"
      ? [{ href: `/captain/team/${teamid}/prospects`, label: "Prospects" }]
      : []),
    { href: `/captain/team/${teamid}/availability`, label: "Availability" },
    { href: `/captain/team/${teamid}/fixtures`, label: "Fixtures" },
    { href: `/captain/team/${teamid}/results`, label: "Results" },
    { href: `/captain/team/${teamid}/payments`, label: "Payments" },
  ];

  return (
    <div className="min-h-screen bg-[#07130f] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                  SIXFL Captain Hub
                </p>

                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {team.name}
                </h1>

                <p className="mt-3 max-w-2xl text-sm text-white/65 sm:text-base">
                  Matchday control, fixtures, results and payments for your team.
                </p>

                <p className="mt-3 text-sm text-white/55">
                  {team.league?.name ?? "No league assigned"}
                  {team.league?.season ? ` · ${team.league.season}` : ""}
                  {team.league?.isActive ? " · Live season" : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {access.isAdmin ? (
                  <Link
                    href={`/admin/teams/${team.id}`}
                    className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white"
                  >
                    Back to admin team
                  </Link>
                ) : null}

                {access.accessMode === "admin-preview" ? (
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
                    <div className="font-medium text-white">Admin preview</div>
                    <div className="mt-1 text-amber-100/75">
                      Viewing the captain area as admin.
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90">
                    <div className="font-medium text-white">Captain access</div>
                    <div className="mt-1 text-emerald-100/70">
                      You are signed in to manage this team.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <nav className="flex flex-wrap gap-2 px-6 py-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}
