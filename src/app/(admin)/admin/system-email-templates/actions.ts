// ========================================
// File: src/app/(admin)/admin/system-email-templates/actions.ts
// ========================================

"use server";

import {
  NotificationAudience,
  NotificationChannel,
  NotificationTemplateKind,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type SystemEmailTemplateActionState = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
  redirectTo?: string;
};

const ALLOWED_CTA_URL_KEYS = [
  "signupUrl",
  "manageTeamUrl",
  "paymentUrl",
  "captainDashboardUrl",
  "teamJoinUrl",
  "squadActivationUrl",
  "fixtureUrl",
  "fixturesUrl",
] as const;

type AllowedCtaUrlKey = (typeof ALLOWED_CTA_URL_KEYS)[number];

function buildValidationError(
  errors: Record<string, string[]>,
  message = "Please fix the highlighted fields.",
): SystemEmailTemplateActionState {
  return {
    ok: false,
    success: false,
    message,
    error: message,
    errors,
  };
}

function slugifyTemplateKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isNotificationAudience(value: string): value is NotificationAudience {
  return (
    value === "LEAD" ||
    value === "TEAM" ||
    value === "PLAYER" ||
    value === "REFEREE" ||
    value === "GENERAL"
  );
}

function isAllowedCtaUrlKey(value: string): value is AllowedCtaUrlKey {
  return ALLOWED_CTA_URL_KEYS.includes(value as AllowedCtaUrlKey);
}

function getTemplateValues(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const keyInput = String(formData.get("key") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const audienceRaw = String(formData.get("audience") ?? "").trim().toUpperCase();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const ctaLabel = String(formData.get("ctaLabel") ?? "").trim();
  const ctaUrlKey = String(formData.get("ctaUrlKey") ?? "").trim();
  const isActive =
    formData.get("isActive") === "true" || formData.get("isActive") === "on";

  return {
    id,
    name,
    keyInput,
    description,
    audienceRaw,
    subject,
    body,
    ctaLabel,
    ctaUrlKey,
    isActive,
  };
}

function validateTemplateInput(values: ReturnType<typeof getTemplateValues>) {
  const errors: Record<string, string[]> = {};

  if (!values.name) {
    errors.name = ["Please enter a template name."];
  }

  if (!values.subject) {
    errors.subject = ["Please enter a subject."];
  }

  if (!values.body) {
    errors.body = ["Please enter a message body."];
  }

  if (!isNotificationAudience(values.audienceRaw)) {
    errors.audience = ["Please select a valid audience."];
  }

  if ((values.ctaLabel && !values.ctaUrlKey) || (!values.ctaLabel && values.ctaUrlKey)) {
    errors.ctaLabel = ["CTA text and CTA destination must be used together."];
    errors.ctaUrlKey = ["CTA text and CTA destination must be used together."];
  }

  if (values.ctaUrlKey && !isAllowedCtaUrlKey(values.ctaUrlKey)) {
    errors.ctaUrlKey = ["Please select a valid CTA destination."];
  }

  const ctaPlaceholderCount = (values.body.match(/\{\{cta\}\}/g) ?? []).length;

  if (ctaPlaceholderCount > 1) {
    errors.body = ['Use "{{cta}}" only once in the message body.'];
  }

  const key = slugifyTemplateKey(values.keyInput || values.name);

  if (!key) {
    errors.key = ["Please enter a valid template key."];
  }

  return {
    errors,
    key,
    audience: isNotificationAudience(values.audienceRaw)
      ? values.audienceRaw
      : undefined,
    ctaUrlKey: values.ctaUrlKey ? values.ctaUrlKey : null,
  };
}

function revalidateTemplatePaths(id?: string) {
  revalidatePath("/admin/templates");
  revalidatePath("/admin/templates/new");
  revalidatePath("/admin/email-templates");
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/messaging");

  if (id) {
    revalidatePath(`/admin/templates/${id}`);
  }
}

export async function createSystemEmailTemplateAction(
  formData: FormData,
): Promise<SystemEmailTemplateActionState> {
  await requireAdmin();

  const values = getTemplateValues(formData);
  const validated = validateTemplateInput(values);

  if (Object.keys(validated.errors).length > 0) {
    return buildValidationError(validated.errors);
  }

  const existing = await prisma.notificationTemplate.findUnique({
    where: { key: validated.key },
    select: { id: true },
  });

  if (existing) {
    return buildValidationError({
      key: ["A template with that key already exists. Please use a different key."],
    });
  }

  const created = await prisma.notificationTemplate.create({
    data: {
      key: validated.key,
      name: values.name,
      description: values.description || null,
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: validated.audience as NotificationAudience,
      subject: values.subject,
      body: values.body,
      ctaLabel: values.ctaLabel || null,
      ctaUrlKey: validated.ctaUrlKey,
      isActive: values.isActive,
    },
    select: { id: true },
  });

  revalidateTemplatePaths(created.id);

  return {
    ok: true,
    success: true,
    message: "System email template created successfully. Opening it now...",
    redirectTo: `/admin/templates/${created.id}`,
  };
}

export async function updateSystemEmailTemplateAction(
  formData: FormData,
): Promise<SystemEmailTemplateActionState> {
  await requireAdmin();

  const values = getTemplateValues(formData);

  if (!values.id) {
    return buildValidationError({
      id: ["Missing template ID."],
    });
  }

  const validated = validateTemplateInput(values);

  if (Object.keys(validated.errors).length > 0) {
    return buildValidationError(validated.errors);
  }

  const existing = await prisma.notificationTemplate.findUnique({
    where: { key: validated.key },
    select: { id: true },
  });

  if (existing && existing.id !== values.id) {
    return buildValidationError({
      key: ["Another template already uses that key. Please use a different key."],
    });
  }

  await prisma.notificationTemplate.update({
    where: { id: values.id },
    data: {
      key: validated.key,
      name: values.name,
      description: values.description || null,
      kind: NotificationTemplateKind.TRANSACTIONAL,
      channel: NotificationChannel.EMAIL,
      audience: validated.audience as NotificationAudience,
      subject: values.subject,
      body: values.body,
      ctaLabel: values.ctaLabel || null,
      ctaUrlKey: validated.ctaUrlKey,
      isActive: values.isActive,
    },
  });

  revalidateTemplatePaths(values.id);

  return {
    ok: true,
    success: true,
    message: "System email template saved successfully.",
  };
}
