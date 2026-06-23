// ========================================
// File: src/app/(admin)/admin/teams/[id]/player-preview/page.tsx
// ========================================

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Preview | SIXFL",
};

export default async function AdminTeamPlayerPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const firstMembership = await prisma.teamMember.findFirst({
    where: { teamId: id },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  if (!firstMembership) {
    redirect(`/player/team/${id}`);
  }

  redirect(
    `/player/team/${id}?previewMembershipId=${encodeURIComponent(firstMembership.id)}`,
  );
}
