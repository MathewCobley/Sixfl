// ========================================
// File: src/app/(admin)/admin/referees/[id]/preview/page.tsx
// ========================================

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminRefereeDashboardPreviewPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/referees/${id}/referee-preview`);
}
