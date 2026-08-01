import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MergePlayerMembershipRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<{ teamId?: string }>;
}) {
  await requireAdmin();

  const { membershipId } = await params;
  const filters = await searchParams;
  const membership = await prisma.teamMember.findUnique({
    where: { id: membershipId },
    select: { userId: true, teamId: true },
  });

  if (!membership) notFound();

  const teamId = filters.teamId?.trim() || membership.teamId;
  redirect(
    `/admin/players/merge/${membership.userId}?teamId=${encodeURIComponent(teamId)}`,
  );
}
