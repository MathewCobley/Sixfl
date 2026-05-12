// ========================================
// File: src/app/captain/team/[teamid]/squad/layout.tsx
// ========================================

import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import WhatsAppSquadBadges from "./WhatsAppSquadBadges";

type CaptainSquadLayoutProps = {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
};

export default async function CaptainSquadLayout({
  children,
  params,
}: CaptainSquadLayoutProps) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  if (!access.isAdmin) {
    redirect(`/captain/team/${teamid}/captain-squad`);
  }

  const whatsappEntries = await prisma.$queryRaw<
    Array<{ id: string; name: string | null; email: string | null }>
  >`
    SELECT u.id, u.name, u.email
    FROM "TeamMember" tm
    INNER JOIN "User" u ON u.id = tm."userId"
    WHERE tm."teamId" = ${teamid}
      AND u."usesWhatsapp" = true
  `;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100 shadow-[0_18px_60px_rgba(0,0,0,0.25)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/70">
              Admin-only managed squad tools
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">Powerful squad management view</h2>
            <p className="mt-1 max-w-3xl text-amber-100/75">
              This route is kept for SIXFL admin use only. Appointed captains are redirected to the safer captain squad view.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/captain/team/${teamid}/captain-squad`}
              className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
            >
              View weaker captain version
            </Link>
            <Link
              href={`/admin/teams/${teamid}/squad`}
              className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
            >
              Open admin squad console
            </Link>
          </div>
        </div>
      </section>
      {children}
      <WhatsAppSquadBadges entries={whatsappEntries} />
    </div>
  );
}
