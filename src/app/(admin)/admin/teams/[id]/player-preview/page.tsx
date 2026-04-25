// ========================================
// File: src/app/(admin)/admin/teams/[id]/player-preview/page.tsx
// ========================================

import { redirect } from "next/navigation";

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

  redirect(`/player/team/${id}`);
}
