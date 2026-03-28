// ========================================
// File: src/app/admin/email-templates/[id]/page.tsx
// ========================================

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import EmailTemplateForm from "@/components/admin/email-templates/EmailTemplateForm";
import { updateEmailTemplateAction } from "@/app/admin/email-templates/actions";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminEmailTemplateEditPage({ params }: PageProps) {
  await requireAdmin();

  const { id } = await params;

  const template = await prisma.emailTemplate.findUnique({
    where: { id },
  });

  if (!template) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div className="space-y-3">
        <p className="text-sm font-medium text-white/45">Admin / Email Templates</p>
        <h1 className="text-4xl font-semibold tracking-tight text-white">
          Edit template
        </h1>
        <p className="text-sm text-white/60">
          Update the email content, placeholders, and CTA settings.
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <EmailTemplateForm
          mode="edit"
          action={updateEmailTemplateAction}
          initialValues={{
            id: template.id,
            key: template.key,
            name: template.name,
            description: template.description ?? "",
            audience: template.audience,
            interestType: template.interestType ?? "",
            subject: template.subject,
            body: template.body,
            ctaLabel: template.ctaLabel ?? "",
            ctaUrlKey: template.ctaUrlKey ?? "",
            isActive: template.isActive,
          }}
        />
      </div>
    </div>
  );
}