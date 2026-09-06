// ========================================
// File: src/app/(admin)/admin/sms-templates/actions.ts
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

type SmsTemplateActionState = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
  redirectTo?: string;
};

type AllowedAudience = "LEAD" | "TEAM" | "PLAYER" | "GENERAL" | "REFEREE";

const ALLOWED_CTA_URL_KEYS = [
  "signupUrl",
  "manageTeamUrl",
  "teamJoinUrl",
  "captainDashboardUrl",
  "fixtureUrl",
  "fixturesUrl",
] as const;
type AllowedCtaUrlKey = (typeof ALLOWED_CTA_URL_KEYS)[number];

function buildValidationError(
  errors: Record<string, string[]>,
  message = "Please fix the highlighted fields.",
): SmsTemplateActionState {
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

function isAllowedAudience(value: string): value is AllowedAudience {
  return (
    value === "LEAD" ||
    value === "TEAM" ||
    value === "PLAYER" ||
    value === "GENERAL" ||
    value === "REFEREE"
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
  const body = String(formData.get("body") ?? "").trim();
  const ctaUrlKey = String(formData.get("ctaUrlKey") ?? "").trim();
  const isActive =
    formData.get("isActive") === "true" || formData.get("isActive") === "on";

  return {
    id,
    name,
    keyInput,
    description,
    audienceRaw,
    body,
    ctaUrlKey,
    isActive,
  };
}

function validateTemplateInput(values: ReturnType<typeof getTemplateValues>) {
  const errors: Record<string, string[]> = {};

  if (!values.name) {
    errors.name = ["Please enter a template name."];
  }

  if (!values.body) {
    errors.body = ["Please enter an SMS body."];
  }

  if (!isAllowedAudience(values.audienceRaw)) {
    errors.audience = ["Please select a valid SMS audience."];
  }

  if (values.ctaUrlKey && !isAllowedCtaUrlKey(values.ctaUrlKey)) {
    errors.ctaUrlKey = ["Please select a valid SMS link destination."];
  }

  const key = slugifyTemplateKey(values.keyInput || values.name);

  if (!key) {
    errors.key = ["Please enter a valid template key."];
  }

  return {
    errors,
    key,
    audience: isAllowedAudience(values.audienceRaw)
      ? values.audienceRaw
      : undefined,
    ctaUrlKey: values.ctaUrlKey ? values.ctaUrlKey : null,
  };
}

function revalidateTemplatePaths(id?: string) {
  revalidatePath("/admin/templates");
  revalidatePath("/admin/templates/new");
  revalidatePath("/admin/sms-templates");
  revalidatePath("/admin/messaging");

  if (id) {
    revalidatePath(`/admin/templates/${id}`);
    revalidatePath(`/admin/sms-templates/${id}`);
  }
}

async function createSmsTemplate(
  formData: FormData,
  kind: NotificationTemplateKind,
): Promise<SmsTemplateActionState> {
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
      kind,
      channel: NotificationChannel.SMS,
      audience: validated.audience as NotificationAudience,
      subject: null,
      body: values.body,
      ctaLabel: null,
      ctaUrlKey: validated.ctaUrlKey,
      isActive: values.isActive,
    },
    select: {
      id: true,
    },
  });

  revalidateTemplatePaths(created.id);
  return { ok: true, success: true, message: "Template saved successfully.", redirectTo: `/admin/templates/${created.id}?created=1` };
}

async function updateSmsTemplate(
  formData: FormData,
  kind: NotificationTemplateKind,
): Promise<SmsTemplateActionState> {
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
      kind,
      channel: NotificationChannel.SMS,
      audience: validated.audience as NotificationAudience,
      subject: null,
      body: values.body,
      ctaLabel: null,
      ctaUrlKey: validated.ctaUrlKey,
      isActive: values.isActive,
    },
  });

  revalidateTemplatePaths(values.id);

  return {
    ok: true,
    success: true,
    message:
      kind === NotificationTemplateKind.TRANSACTIONAL
        ? "System SMS template saved successfully."
        : "SMS template saved successfully.",
  };
}

export async function createSmsTemplateAction(
  formData: FormData,
): Promise<SmsTemplateActionState> {
  return createSmsTemplate(formData, NotificationTemplateKind.CAMPAIGN);
}

export async function updateSmsTemplateAction(
  formData: FormData,
): Promise<SmsTemplateActionState> {
  return updateSmsTemplate(formData, NotificationTemplateKind.CAMPAIGN);
}

export async function createSystemSmsTemplateAction(
  formData: FormData,
): Promise<SmsTemplateActionState> {
  return createSmsTemplate(formData, NotificationTemplateKind.TRANSACTIONAL);
}

export async function updateSystemSmsTemplateAction(
  formData: FormData,
): Promise<SmsTemplateActionState> {
  return updateSmsTemplate(formData, NotificationTemplateKind.TRANSACTIONAL);
}
