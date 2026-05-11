// ========================================
// File: src/app/captain/team/[teamid]/squad/layout.tsx
// ========================================

import type { ReactNode } from "react";

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
  await requireCaptain(teamid);

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
    <>
      {children}
      <WhatsAppSquadBadges entries={whatsappEntries} />
    </>
  );
}
