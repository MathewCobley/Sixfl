// ========================================
// File: src/app/(admin)/admin/email-templates/[id]/page.tsx
// ========================================

import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminEmailTemplateEditPage({ params }: PageProps) {
  const { id } = await params;

  redirect(`/admin/templates/${id}`);
}
