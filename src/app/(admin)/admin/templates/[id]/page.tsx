// ========================================
// File: src/app/(admin)/admin/templates/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationTemplateKind,
} from "@prisma/client";
import AdminCard from "@/components/admin/AdminCard";
import EmailTemplateForm from "@/components/admin/email-templates/EmailTemplateForm";
import SmsTemplateForm from "@/components/admin/sms-templates/SmsTemplateForm";
import { updateEmailTemplateAction } from "@/app/(admin)/admin/email-templates/actions";
import { updateSmsTemplateAction } from "@/app/(admin)/admin/sms-templates/actions";
import { updateSystemEmailTemplateAction } from "@/app/(admin)/admin/system-email-templates/actions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type PageProps = {
  params: Promise<{ id: string }>;
};

type TemplateAudience = "LEAD" | "TEAM" | "PLAYER" | "REFEREE" | "GENERAL";

type EmailCtaUrlKey =
  | "signupUrl"
  | "manageTeamUrl"
  | "paymentUrl"
  | "captainDashboardUrl"
  | "teamJoinUrl"
  | "fixtureUrl"
  | "fixturesUrl";

type SmsTemplateAudience = "LEAD" | "TEAM" | "PLAYER";
type SmsCtaUrlKey = "signupUrl" | "manageTeamUrl" | "teamJoinUrl";

function getEmailCtaUrlKey(value: string | null): EmailCtaUrlKey | undefined {
  if (
    value === "signupUrl" ||
    value === "manageTeamUrl" ||
    value === "paymentUrl" ||
    value === "captainDashboardUrl" ||
    value === "teamJoinUrl" ||
    value === "fixtureUrl" ||
    value === "fixturesUrl"
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

function getTemplateAudience(
  value: NotificationAudience,
): TemplateAudience | undefined {
  if (
    value === NotificationAudience.LEAD ||
    value === NotificationAudience.TEAM ||
    value === NotificationAudience.PLAYER ||
    value === NotificationAudience.REFEREE ||
    value === NotificationAudience.GENERAL
  ) {
    return value;
  }

  return undefined;
}

function getSmsTemplateAudience(
  value: NotificationAudience,
): SmsTemplateAudience | undefined {
  if (
    value === NotificationAudience.LEAD ||
    value === NotificationAudience.TEAM ||
    value === NotificationAudience.PLAYER
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
                Campaign email
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                Edit template
              </h1>
            </div>

            <Link
              href="/admin/templates?type=campaign&channel=EMAIL"
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

  const notificationTemplate = await prisma.notificationTemplate.findUnique({
    where: { id },
  });

  const notificationTemplateAudience = notificationTemplate
    ? getTemplateAudience(notificationTemplate.audience)
    : undefined;

  if (
    notificationTemplate &&
    notificationTemplate.channel === NotificationChannel.EMAIL &&
    notificationTemplate.kind === NotificationTemplateKind.TRANSACTIONAL
  ) {
    if (!notificationTemplateAudience) {
      notFound();
    }

    return (
      <AdminCard title="Edit System Email Template">
        <div className="space-y-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                System email
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                Edit template
              </h1>
            </div>

            <Link
              href="/admin/templates?type=system"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 transition hover:bg-black/30 hover:text-white"
            >
              Back to templates
            </Link>
          </div>

          <EmailTemplateForm
            mode="edit"
            action={updateSystemEmailTemplateAction}
            initialValues={{
              id: notificationTemplate.id,
              key: notificationTemplate.key,
              name: notificationTemplate.name,
              description: notificationTemplate.description ?? "",
              audience: notificationTemplateAudience,
              subject: notificationTemplate.subject ?? "",
              body: notificationTemplate.body,
              ctaLabel: notificationTemplate.ctaLabel ?? "",
              ctaUrlKey: getEmailCtaUrlKey(notificationTemplate.ctaUrlKey),
              isActive: notificationTemplate.isActive,
            }}
          />
        </div>
      </AdminCard>
    );
  }

  const smsTemplateAudience = notificationTemplate
    ? getSmsTemplateAudience(notificationTemplate.audience)
    : undefined;

  if (
    !notificationTemplate ||
    notificationTemplate.channel !== NotificationChannel.SMS ||
    !smsTemplateAudience
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
          </div>

          <Link
            href="/admin/templates?type=campaign&channel=SMS"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 transition hover:bg-black/30 hover:text-white"
          >
            Back to templates
          </Link>
        </div>

        <SmsTemplateForm
          mode="edit"
          action={updateSmsTemplateAction}
          initialValues={{
            id: notificationTemplate.id,
            key: notificationTemplate.key,
            name: notificationTemplate.name,
            description: notificationTemplate.description ?? "",
            audience: smsTemplateAudience,
            body: notificationTemplate.body,
            ctaUrlKey: getSmsCtaUrlKey(notificationTemplate.ctaUrlKey),
            isActive: notificationTemplate.isActive,
          }}
        />
      </div>
    </AdminCard>
  );
}
