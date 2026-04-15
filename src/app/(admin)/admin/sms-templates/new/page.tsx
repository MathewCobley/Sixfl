// ========================================
// File: src/app/(admin)/admin/sms-templates/new/page.tsx
// ========================================

import Link from "next/link";
import AdminCard from "@/components/admin/AdminCard";
import { requireAdmin } from "@/lib/requireAdmin";
import SmsTemplateForm from "@/components/admin/sms-templates/SmsTemplateForm";
import { createSmsTemplateAction } from "@/app/(admin)/admin/sms-templates/actions";

export default async function NewSmsTemplatePage() {
  await requireAdmin();

  return (
    <AdminCard title="Create SMS Template">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Create SMS template
            </h1>

            <p className="max-w-2xl text-sm leading-6 text-white/65">
              Build a reusable SIXFL SMS template for leads or teams.
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
          mode="create"
          action={createSmsTemplateAction}
        />
      </div>
    </AdminCard>
  );
}
