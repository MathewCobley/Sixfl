// ========================================
// File: src/app/captain/team/[teamid]/availability/layout.tsx
// ========================================

import Link from "next/link";
import type { ReactNode } from "react";

import { getOpenFixturePlayerRequests } from "@/lib/fixturePlayerRequests";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import WhatsAppAvailabilityBadges from "./WhatsAppAvailabilityBadges";

type CaptainAvailabilityLayoutProps = {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
};

export default async function CaptainAvailabilityLayout({
  children,
  params,
}: CaptainAvailabilityLayoutProps) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const [whatsappEntries, openRequests] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; name: string | null; email: string | null }>>`
      SELECT u.id, u.name, u.email
      FROM "TeamMember" tm
      INNER JOIN "User" u ON u.id = tm."userId"
      WHERE tm."teamId" = ${teamid}
        AND u."usesWhatsapp" = true
    `,
    getOpenFixturePlayerRequests({ teamId: teamid }),
  ]);

  const withdrawalCount = openRequests.filter(
    (request) => request.type === "WITHDRAWAL",
  ).length;
  const waitlistCount = openRequests.filter(
    (request) => request.type === "WAITLIST",
  ).length;

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <Link
          href={`/captain/team/${teamid}/availability`}
          className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
        >
          Player availability
        </Link>
        <Link
          href={`/captain/team/${teamid}/availability/requests`}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
            openRequests.length > 0
              ? "border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
              : "border-white/10 bg-black/20 text-white/65 hover:bg-white/[0.06]"
          }`}
        >
          Player requests
          {openRequests.length > 0 ? (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-amber-300 px-1.5 py-0.5 text-[11px] font-bold text-black">
              {openRequests.length}
            </span>
          ) : null}
        </Link>
        {withdrawalCount > 0 ? (
          <span className="inline-flex items-center rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100">
            {withdrawalCount} withdrawal{withdrawalCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {waitlistCount > 0 ? (
          <span className="inline-flex items-center rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-100">
            {waitlistCount} waiting
          </span>
        ) : null}
      </div>
      {children}
      <WhatsAppAvailabilityBadges entries={whatsappEntries} />
    </>
  );
}
