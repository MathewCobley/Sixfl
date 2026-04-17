// ========================================
// File: src/app/(admin)/admin/templates/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationChannel } from "@prisma/client";
import AdminCard from "@/components/admin/AdminCard";
import EmailTemplateForm from "@/components/admin/email-templates/EmailTemplateForm";
import SmsTemplateForm from "@/components/admin/sms-templates/SmsTemplateForm";
import { updateEmailTemplateAction } from "@/app/(admin)/admin/email-templates/actions";
import { updateSmsTemplateAction } from "@/app/(admin)/admin/sms-templates/actions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type PageProps = {
  params: Promise<{ id: string }>;
};

type EmailCtaUrlKey =
  | "signupUrl"
  | "manageTeamUrl"
  | "paymentUrl"
  | "captainDashboardUrl"
  | "teamJoinUrl";

type SmsCtaUrlKey = "signupUrl" | "manageTeamUrl" | "teamJoinUrl";

function getEmailCtaUrlKey(value: string | null): EmailCtaUrlKey | undefined {
  if (
    value === "signupUrl" ||
    value === "manageTeamUrl" ||
    value === "paymentUrl" ||
    value === "captainDashboardUrl" ||
    value === "teamJoinUrl"
  ) {
    return value;
  }

  return undefined;
}

function getSmsCtaUrlKey(value: string | null): SmsCtaUrlKey | undefined {
  if (
    value === "signupUrl" ||
    value === "manageTeamUrl" ||
    value === "teamJoinUrl"
  ) {
    return value;
  }

  return undefined;
}

export default async function EditTemplatePage({ params }: PageProps) {
  await requireAdmin();

  const { id } = await params;

  const emailTemplate = await prisma.emailTemplate.findUnique({
    where: { id },
  });

  if (emailTemplate) {
    return (
      <AdminCard title="Edit Email Template">
        <div className="space-y-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Email template
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                Edit template
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-white/65">
                Update the email content, placeholders, and CTA settings.
              </p>
            </div>

            <Link
              href="/admin/templates?channel=EMAIL"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 transition hover:bg-black/30 hover:text-white"
            >
              Back to templates
            </Link>
          </div>

          <EmailTemplateForm
            mode="edit"
            action={updateEmailTemplateAction}
            initialValues={{
              id: emailTemplate.id,
              key: emailTemplate.key,
              name: emailTemplate.name,
              description: emailTemplate.description ?? "",
              audience: emailTemplate.audience,
              interestType: emailTemplate.interestType ?? undefined,
              subject: emailTemplate.subject,
              body: emailTemplate.body,
              ctaLabel: emailTemplate.ctaLabel ?? "",
              ctaUrlKey: getEmailCtaUrlKey(emailTemplate.ctaUrlKey),
              isActive: emailTemplate.isActive,
            }}
          />
        </div>
      </AdminCard>
    );
  }

  const smsTemplate = await prisma.notificationTemplate.findUnique({
    where: { id },
  });

  if (
    !smsTemplate ||
    smsTemplate.channel !== NotificationChannel.SMS ||
    (smsTemplate.audience !== "LEAD" && smsTemplate.audience !== "TEAM")
  ) {
    notFound();
  }

  return (
    <AdminCard title="Edit SMS Template">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300">
              SMS template
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Edit template
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-white/65">
              Update this reusable SMS template for lead or team messaging.
            </p>
          </div>

          <Link
            href="/admin/templates?channel=SMS"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 transition hover:bg-black/30 hover:text-white"
          >
            Back to templates
          </Link>
        </div>

        <SmsTemplateForm
          mode="edit"
          action={updateSmsTemplateAction}
          initialValues={{
            id: smsTemplate.id,
            key: smsTemplate.key,
            name: smsTemplate.name,
            description: smsTemplate.description ?? "",
            audience: smsTemplate.audience === "TEAM" ? "TEAM" : "LEAD",
            body: smsTemplate.body,
            ctaUrlKey: getSmsCtaUrlKey(smsTemplate.ctaUrlKey),
            isActive: smsTemplate.isActive,
          }}
        />
      </div>
    </AdminCard>
  );
}
