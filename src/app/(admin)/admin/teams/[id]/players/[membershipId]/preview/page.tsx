// ========================================
// File: src/app/(admin)/admin/teams/[id]/players/[membershipId]/preview/page.tsx
// ========================================

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Dashboard Preview | SIXFL Admin",
};

export default async function AdminPlayerDashboardPreviewPage({
  params,
}: {
  params: Promise<{ id: string; membershipId: string }>;
}) {
  await requireAdmin();

  const { id: teamid, membershipId } = await params;

  redirect(
    `/player/team/${teamid}?previewMembershipId=${encodeURIComponent(membershipId)}`,
  );
}
