// ========================================
// File: src/app/(admin)/admin/templates/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type TemplateCopySource = "email" | "notification";

type TemplateDeleteSource = "email" | "notification";

function slugifyTemplateKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['\"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getUniqueEmailTemplateKey(baseKey: string) {
  const cleanBaseKey = slugifyTemplateKey(baseKey) || "copied-email-template";
  let candidate = cleanBaseKey;
  let suffix = 2;

  while (await prisma.emailTemplate.findUnique({ where: { key: candidate }, select: { id: true } })) {
    candidate = `${cleanBaseKey}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function getUniqueNotificationTemplateKey(baseKey: string) {
  const cleanBaseKey = slugifyTemplateKey(baseKey) || "copied-notification-template";
  let candidate = cleanBaseKey;
  let suffix = 2;

  while (await prisma.notificationTemplate.findUnique({ where: { key: candidate }, select: { id: true } })) {
    candidate = `${cleanBaseKey}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function revalidateTemplatePaths(id?: string) {
  revalidatePath("/admin/templates");
  revalidatePath("/admin/templates/new");
  revalidatePath("/admin/email-templates");
  revalidatePath("/admin/messaging");

  if (id) {
    revalidatePath(`/admin/templates/${id}`);
  }
}

export async function ensureYesIWantToPlayTemplateAction() {
  await requireAdmin();

  const template = await prisma.emailTemplate.upsert({
    where: { key: "yes-i-want-to-play" },
    update: {
      name: "Yes, I want to play",
      description: "Simple player follow-up email for prospects who need to complete the sign-up/details form.",
      audience: "PLAYER",
      interestType: "PLAYER",
      subject: "Want to play in SIXFL?",
      body: [
        "Hi {{firstName}},",
        "",
        "We’ve got playing opportunities available in SIXFL.",
        "",
        "If you still want to play, click the button below and complete your details.",
        "",
        "{{cta}}",
        "",
        "Once we have your details, we can add you to the right squad or invite you to a team.",
        "",
        "Thanks,",
        "",
        "SIXFL",
      ].join("\n"),
      ctaLabel: "Yes, I want to play",
      ctaUrlKey: "signupUrl",
      isActive: true,
    },
    create: {
      key: "yes-i-want-to-play",
      name: "Yes, I want to play",
      description: "Simple player follow-up email for prospects who need to complete the sign-up/details form.",
      audience: "PLAYER",
      interestType: "PLAYER",
      subject: "Want to play in SIXFL?",
      body: [
        "Hi {{firstName}},",
        "",
        "We’ve got playing opportunities available in SIXFL.",
        "",
        "If you still want to play, click the button below and complete your details.",
        "",
        "{{cta}}",
        "",
        "Once we have your details, we can add you to the right squad or invite you to a team.",
        "",
        "Thanks,",
        "",
        "SIXFL",
      ].join("\n"),
      ctaLabel: "Yes, I want to play",
      ctaUrlKey: "signupUrl",
      isActive: true,
    },
    select: { id: true },
  });

  revalidateTemplatePaths(template.id);
  redirect(`/admin/templates/${template.id}`);
}

export async function copyTemplateAction(formData: FormData) {
  await requireAdmin();

  const source = String(formData.get("source") ?? "").trim() as TemplateCopySource;
  const templateId = String(formData.get("templateId") ?? "").trim();

  if (!templateId || (source !== "email" && source !== "notification")) {
    redirect("/admin/templates?error=copy-failed");
  }

  if (source === "email") {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      redirect("/admin/templates?error=copy-failed");
    }

    const created = await prisma.emailTemplate.create({
      data: {
        key: await getUniqueEmailTemplateKey(`copy-of-${template.key}`),
        name: `Copy of ${template.name}`,
        description: template.description,
        audience: template.audience,
        interestType: template.interestType,
        subject: template.subject,
        body: template.body,
        ctaLabel: template.ctaLabel,
        ctaUrlKey: template.ctaUrlKey,
        isActive: false,
      },
      select: { id: true },
    });

    revalidateTemplatePaths(created.id);
    redirect(`/admin/templates/${created.id}`);
  }

  const template = await prisma.notificationTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    redirect("/admin/templates?error=copy-failed");
  }

  const created = await prisma.notificationTemplate.create({
    data: {
      key: await getUniqueNotificationTemplateKey(`copy-of-${template.key}`),
      name: `Copy of ${template.name}`,
      description: template.description,
      kind: template.kind,
      channel: template.channel,
      audience: template.audience,
      subject: template.subject,
      body: template.body,
      ctaLabel: template.ctaLabel,
      ctaUrlKey: template.ctaUrlKey,
      isActive: false,
    },
    select: { id: true },
  });

  revalidateTemplatePaths(created.id);
  redirect(`/admin/templates/${created.id}`);
}

export async function deleteTemplateAction(formData: FormData) {
  await requireAdmin();

  const source = String(formData.get("source") ?? "").trim() as TemplateDeleteSource;
  const templateId = String(formData.get("templateId") ?? "").trim();

  if (!templateId || (source !== "email" && source !== "notification")) {
    redirect("/admin/templates?error=delete-failed");
  }

  if (source === "email") {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: templateId },
      select: { id: true },
    });

    if (!template) {
      redirect("/admin/templates?error=delete-failed");
    }

    await prisma.emailTemplate.delete({
      where: { id: templateId },
    });

    revalidateTemplatePaths(templateId);
    redirect("/admin/templates?deleted=template");
  }

  const template = await prisma.notificationTemplate.findUnique({
    where: { id: templateId },
    select: { id: true },
  });

  if (!template) {
    redirect("/admin/templates?error=delete-failed");
  }

  await prisma.notificationTemplate.delete({
    where: { id: templateId },
  });

  revalidateTemplatePaths(templateId);
  redirect("/admin/templates?deleted=template");
}
