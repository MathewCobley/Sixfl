// ========================================
// File: src/app/(admin)/admin/sms-templates/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationChannel } from "@prisma/client";
import AdminCard from "@/components/admin/AdminCard";
import SmsTemplateForm from "@/components/admin/sms-templates/SmsTemplateForm";
import { updateSmsTemplateAction } from "@/app/(admin)/admin/sms-templates/actions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditSmsTemplatePage({ params }: PageProps) {
  await requireAdmin();

  const { id } = await params;

  const template = await prisma.notificationTemplate.findUnique({
    where: { id },
  });

  if (
    !template ||
    template.channel !== NotificationChannel.SMS ||
    (template.audience !== "LEAD" && template.audience !== "TEAM")
  ) {
    notFound();
  }

  return (
    <AdminCard title="Edit SMS Template">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Edit SMS template
            </h1>

            <p className="max-w-2xl text-sm leading-6 text-white/65">
              Update this reusable SMS template for {template.audience === "LEAD" ? "lead" : "team"} messaging.
            </p>
          </div>

          <Link
            href="/admin/sms-templates"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 transition hover:bg-black/30 hover:text-white"
          >
            Back to SMS templates
          </Link>
        </div>

        <SmsTemplateForm
          mode="edit"
          action={updateSmsTemplateAction}
          initialValues={{
            id: template.id,
            key: template.key,
            name: template.name,
            description: template.description ?? "",
            audience: template.audience === "TEAM" ? "TEAM" : "LEAD",
            body: template.body,
            isActive: template.isActive,
          }}
        />
      </div>
    </AdminCard>
  );
}
