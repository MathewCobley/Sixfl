// ========================================
// File: src/app/(admin)/admin/sms-templates/[id]/page.tsx
// ========================================

import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditSmsTemplatePage({ params }: PageProps) {
  const { id } = await params;

  redirect(`/admin/templates/${id}`);
}
