// ========================================
// File: src/app/(admin)/admin/teams/[id]/match-fees/page.tsx
// ========================================

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    fixtureId?: string;
  }>;
};

export default async function AdminManagedPlayerMatchFeesRedirect({
  params,
  searchParams,
}: Props) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const fixtureQuery = sp.fixtureId
    ? `?fixtureId=${encodeURIComponent(sp.fixtureId)}`
    : "";

  redirect(`/captain/team/${id}/match-fees${fixtureQuery}`);
}
