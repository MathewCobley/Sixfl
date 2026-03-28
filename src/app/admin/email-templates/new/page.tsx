// ========================================
// File: src/app/admin/email-templates/new/page.tsx
// ========================================

import Link from "next/link";
import AdminCard from "@/components/admin/AdminCard";
import { requireAdmin } from "@/lib/requireAdmin";
import EmailTemplateForm from "@/components/admin/email-templates/EmailTemplateForm";
import { createEmailTemplateAction } from "@/app/admin/email-templates/actions";

export default async function NewEmailTemplatePage() {
  await requireAdmin();

  return (
    <AdminCard title="Create Email Template">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Create email template
            </h1>

            <p className="max-w-2xl text-sm leading-6 text-white/65">
              Build a reusable SIXFL email template for leads, teams, and future
              admin communications.
            </p>
          </div>

          <Link
            href="/admin/email-templates"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 transition hover:bg-black/30 hover:text-white"
          >
            Back to templates
          </Link>
        </div>

        <EmailTemplateForm
          mode="create"
          action={createEmailTemplateAction}
        />
      </div>
    </AdminCard>
  );
}