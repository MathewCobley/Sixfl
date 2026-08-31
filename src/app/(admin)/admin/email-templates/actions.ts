// ========================================
// File: src/app/(admin)/admin/email-templates/actions.ts
// ========================================

"use server";

// ========================================
// Imports
// ========================================

import { revalidatePath } from "next/cache";
import { InterestType, TemplateAudience } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

// ========================================
// Types
// ========================================

type EmailTemplateActionState = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
  redirectTo?: string;
};

// ========================================
// Constants
// ========================================

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

// ========================================
// Helpers
// ========================================

function isTemplateAudience(value: string): value is TemplateAudience {
  return (
    value === "LEAD" ||
    value === "TEAM" ||
    value === "PLAYER" ||
    value === "REFEREE" ||
    value === "GENERAL"
  );
}

function isInterestType(value: string): value is InterestType {
  return value === "TEAM" || value === "PLAYER" || value === "REFEREE";
}

function isAllowedCtaUrlKey(value: string): value is AllowedCtaUrlKey {
  return ALLOWED_CTA_URL_KEYS.includes(value as AllowedCtaUrlKey);
}

function slugifyTemplateKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildValidationError(
  errors: Record<string, string[]>,
  message = "Please fix the highlighted fields.",
): EmailTemplateActionState {
  return {
    ok: false,
    success: false,
    message,
    error: message,
    errors,
  };
}

function countCtaPlaceholders(text: string) {
  return (text.match(/\{\{cta\}\}/g) ?? []).length;
}

function getTemplateValues(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const keyInput = String(formData.get("key") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const audienceRaw = String(formData.get("audience") ?? "")
    .trim()
    .toUpperCase();
  const interestTypeRaw = String(formData.get("interestType") ?? "")
    .trim()
    .toUpperCase();
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
    interestTypeRaw,
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

  if (!isTemplateAudience(values.audienceRaw)) {
    errors.audience = ["Please select a valid audience."];
  }

  if (values.interestTypeRaw && !isInterestType(values.interestTypeRaw)) {
    errors.interestType = ["Please select a valid interest type."];
  }

  if (
    (values.ctaLabel && !values.ctaUrlKey) ||
    (!values.ctaLabel && values.ctaUrlKey)
  ) {
    errors.ctaLabel = ["CTA text and CTA destination must be used together."];
    errors.ctaUrlKey = [
      "CTA text and CTA destination must be used together.",
    ];
  }

  if (values.ctaUrlKey && !isAllowedCtaUrlKey(values.ctaUrlKey)) {
    errors.ctaUrlKey = ["Please select a valid CTA destination."];
  }

  const ctaPlaceholderCount = countCtaPlaceholders(values.body);

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
    audience: isTemplateAudience(values.audienceRaw)
      ? values.audienceRaw
      : undefined,
    interestType: isInterestType(values.interestTypeRaw)
      ? values.interestTypeRaw
      : null,
    ctaUrlKey: values.ctaUrlKey ? values.ctaUrlKey : null,
  };
}

function revalidateTemplatePaths(id?: string) {
  revalidatePath("/admin/templates");
  revalidatePath("/admin/templates/new");
  revalidatePath("/admin/email-templates");
  revalidatePath("/admin/leads");

  if (id) {
    revalidatePath(`/admin/templates/${id}`);
    revalidatePath(`/admin/email-templates/${id}`);
  }
}

// ========================================
// Actions
// ========================================

export async function createEmailTemplateAction(
  formData: FormData,
): Promise<EmailTemplateActionState> {
  await requireAdmin();

  const values = getTemplateValues(formData);
  const validated = validateTemplateInput(values);

  if (Object.keys(validated.errors).length > 0) {
    return buildValidationError(validated.errors);
  }

  const existing = await prisma.emailTemplate.findUnique({
    where: { key: validated.key },
    select: { id: true },
  });

  if (existing) {
    return buildValidationError({
      key: [
        "A template with that key already exists. Please use a different key.",
      ],
    });
  }

  const created = await prisma.emailTemplate.create({
    data: {
      key: validated.key,
      name: values.name,
      description: values.description || null,
      audience: validated.audience!,
      interestType: validated.interestType,
      subject: values.subject,
      body: values.body,
      ctaLabel: values.ctaLabel || null,
      ctaUrlKey: validated.ctaUrlKey,
      isActive: values.isActive,
    },
    select: {
      id: true,
    },
  });

  revalidateTemplatePaths(created.id);

  return {
    ok: true,
    success: true,
    message: "Template created successfully. Opening it now...",
    redirectTo: `/admin/templates/${created.id}`,
  };
}

export async function updateEmailTemplateAction(
  formData: FormData,
): Promise<EmailTemplateActionState> {
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

  const existing = await prisma.emailTemplate.findUnique({
    where: { key: validated.key },
    select: { id: true },
  });

  if (existing && existing.id !== values.id) {
    return buildValidationError({
      key: [
        "Another template already uses that key. Please use a different key.",
      ],
    });
  }

  await prisma.emailTemplate.update({
    where: { id: values.id },
    data: {
      key: validated.key,
      name: values.name,
      description: values.description || null,
      audience: validated.audience!,
      interestType: validated.interestType,
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
    message: "Template saved successfully.",
  };
}
