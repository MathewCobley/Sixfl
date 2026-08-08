"use server";

import { NotificationAudience, NotificationChannel } from "@prisma/client";
import { redirect } from "next/navigation";

import {
  ANNOUNCEMENT_SOURCE_TYPE,
  findOrCreateAnnouncementRecipient,
  getAnnouncementAlreadyQueuedEmails,
  getAnnouncementFirstName,
  getAnnouncementSourceId,
  getAnnouncementTemplateCompatibility,
  getSystemAnnouncementAudience,
  resolveAnnouncementCta,
} from "@/lib/communications/system-announcements";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { queueDirectNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getPublicSiteUrl } from "@/lib/stripe/client";

function appendParams(
  path: string,
  values: Record<string, string | number | null | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export async function sendSystemAnnouncementAction(formData: FormData) {
  const admin = await requireAdmin();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const confirmed = String(formData.get("confirm") ?? "").trim() === "yes";
  const basePath = "/admin/messaging/announcements";

  if (!templateId) {
    redirect(appendParams(basePath, { error: "Choose an email template first." }));
  }

  if (!confirmed) {
    redirect(
      appendParams(basePath, {
        template: templateId,
        error: "Confirm that you have reviewed the announcement before queueing it.",
      }),
    );
  }

  const template = await prisma.emailTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template || !template.isActive) {
    redirect(
      appendParams(basePath, {
        template: templateId,
        error: "That email template is missing or inactive.",
      }),
    );
  }

  const compatibility = getAnnouncementTemplateCompatibility({
    subject: template.subject,
    body: template.body,
    ctaLabel: template.ctaLabel,
    ctaUrlKey: template.ctaUrlKey,
  });

  if (!compatibility.compatible) {
    const problems = [
      compatibility.unsupportedTokens.length
        ? `Unsupported announcement placeholders: ${compatibility.unsupportedTokens
            .map((token) => `{{${token}}}`)
            .join(", ")}.`
        : null,
      compatibility.unsupportedCta
        ? `CTA destination ${compatibility.unsupportedCta} is recipient-specific and cannot be used for a system-wide announcement.`
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    redirect(
      appendParams(basePath, {
        template: template.id,
        error: problems,
      }),
    );
  }

  const announcementSourceId = getAnnouncementSourceId({
    id: template.id,
    subject: template.subject,
    body: template.body,
    ctaLabel: template.ctaLabel,
    ctaUrlKey: template.ctaUrlKey,
  });

  const [audience, alreadyQueuedEmails] = await Promise.all([
    getSystemAnnouncementAudience(),
    getAnnouncementAlreadyQueuedEmails(announcementSourceId),
  ]);

  const publicSite = getPublicSiteUrl();
  const dashboardUrl = `${publicSite}/dashboard`;
  const signupUrl = `${publicSite}/register-interest`;
  const emailCta = resolveAnnouncementCta({
    label: template.ctaLabel,
    urlKey: template.ctaUrlKey,
    dashboardUrl,
    signupUrl,
  });

  let queued = 0;
  let skipped = 0;
  let already = 0;
  let failed = 0;

  for (const person of audience) {
    if (alreadyQueuedEmails.has(person.email)) {
      already += 1;
      continue;
    }

    try {
      const recipientId = await findOrCreateAnnouncementRecipient(person);
      const displayName = person.displayName?.trim() || "there";

      const dispatch = await queueDirectNotification({
        recipientId,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.GENERAL,
        subject: template.subject,
        body: template.body,
        isTransactional: true,
        sourceType: ANNOUNCEMENT_SOURCE_TYPE,
        sourceId: announcementSourceId,
        variables: {
          firstName: getAnnouncementFirstName(person.displayName),
          name: displayName,
          fullName: displayName,
          link: dashboardUrl,
          captainDashboardUrl: dashboardUrl,
          signInUrl: dashboardUrl,
          signupUrl,
        },
        emailCta,
        metadata: {
          announcementSourceId,
          announcementTemplateId: template.id,
          announcementTemplateKey: template.key,
          announcementTemplateName: template.name,
          emailNormalized: person.email,
        },
        createdByUserId: admin.user?.id ?? null,
      });

      if (dispatch.status === "SKIPPED" || dispatch.status === "CANCELLED") {
        skipped += 1;
      } else {
        queued += 1;
      }
    } catch (error) {
      failed += 1;
      console.error("System announcement queue failed", {
        templateId: template.id,
        announcementSourceId,
        email: person.email,
        error,
      });
    }
  }

  if (queued > 0) {
    try {
      await processNotificationQueue(Math.max(queued + 20, 50));
    } catch (error) {
      console.error("System announcement immediate queue processing failed", error);
    }
  }

  redirect(
    appendParams(basePath, {
      template: template.id,
      sent: 1,
      queued,
      skipped,
      already,
      failed,
    }),
  );
}
