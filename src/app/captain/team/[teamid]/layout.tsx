// ========================================
// File: src/app/captain/team/[teamid]/layout.tsx
// ========================================

import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const metadata = {
  title: "Captain Dashboard | SIXFL",
};

export default async function CaptainTeamLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;

  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
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
  });

  if (!team) {
    notFound();
  }

  const links = [
    { href: `/captain/team/${team.id}`, label: "Overview" },
    { href: `/captain/team/${team.id}/results`, label: "Results" },
    { href: `/captain/team/${team.id}/payments`, label: "Payments" },
  ];

  return (
    <div className="min-h-screen bg-[#0a1020] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-emerald-300/80">
                Captain dashboard
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                {team.name}
              </h1>
              <p className="mt-2 text-sm text-white/65">
                {team.league?.name ?? "Unassigned league"}
                {team.league?.season ? ` · ${team.league.season}` : ""}
              </p>
            </div>

            <nav className="flex flex-wrap gap-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
