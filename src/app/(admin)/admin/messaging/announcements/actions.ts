"use server";

import { createHash } from "crypto";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";
import { redirect } from "next/navigation";

import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { extractNotificationTokens } from "@/lib/notifications/renderer";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { queueDirectNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getPublicSiteUrl } from "@/lib/stripe/client";

const ANNOUNCEMENT_SOURCE_TYPE = "ANNOUNCEMENT";

const SUPPORTED_ANNOUNCEMENT_TOKENS = new Set([
  "firstName",
  "name",
  "fullName",
  "link",
  "captainDashboardUrl",
  "signInUrl",
  "signupUrl",
  "cta",
]);

export type SystemAnnouncementAudienceRow = {
  email: string;
  displayName: string | null;
};

type ExistingRecipientRow = {
  id: string;
  sourceType: string;
  isSuppressed: boolean;
};

function cleanEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() || "";
  return email.includes("@") ? email : "";
}

function firstName(value: string | null) {
  return value?.trim().split(/\s+/)[0]?.trim() || "there";
}

function appendParams(path: string, values: Record<string, string | number | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function getRecipientPriority(sourceType: string) {
  switch (sourceType) {
    case "USER":
      return 0;
    case "PLAYER":
      return 1;
    case "TEAM":
      return 2;
    case "REFEREE":
      return 3;
    case "LEAD":
      return 4;
    default:
      return 5;
  }
}

export async function getSystemAnnouncementAudience() {
  const rows = await prisma.$queryRaw<SystemAnnouncementAudienceRow[]>(Prisma.sql`
    WITH raw_emails AS (
      SELECT
        LOWER(TRIM(users."email")) AS "email",
        NULLIF(TRIM(users."name"), '') AS "displayName"
      FROM "User" users
      WHERE users."email" IS NOT NULL
        AND TRIM(users."email") <> ''

      UNION ALL

      SELECT
        LOWER(TRIM(team."contactEmail")) AS "email",
        COALESCE(NULLIF(TRIM(team."contactName"), ''), NULLIF(TRIM(team."name"), '')) AS "displayName"
      FROM "Team" team
      WHERE team."contactEmail" IS NOT NULL
        AND TRIM(team."contactEmail") <> ''

      UNION ALL

      SELECT
        LOWER(TRIM(prospect."email")) AS "email",
        NULLIF(TRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")), '') AS "displayName"
      FROM "TeamPlayerProspect" prospect
      WHERE prospect."email" IS NOT NULL
        AND TRIM(prospect."email") <> ''

      UNION ALL

      SELECT
        LOWER(TRIM(lead."email")) AS "email",
        COALESCE(NULLIF(TRIM(lead."contactName"), ''), NULLIF(TRIM(lead."teamName"), '')) AS "displayName"
      FROM "InterestLead" lead
      WHERE lead."email" IS NOT NULL
        AND TRIM(lead."email") <> ''

      UNION ALL

      SELECT
        LOWER(TRIM(recipient."email")) AS "email",
        NULLIF(TRIM(recipient."displayName"), '') AS "displayName"
      FROM "NotificationRecipient" recipient
      WHERE recipient."email" IS NOT NULL
        AND TRIM(recipient."email") <> ''

      UNION ALL

      SELECT
        LOWER(TRIM(pool."emailNormalized")) AS "email",
        NULL::TEXT AS "displayName"
      FROM "PlayerPoolProfile" pool
      WHERE pool."emailNormalized" IS NOT NULL
        AND TRIM(pool."emailNormalized") <> ''
    )
    SELECT
      raw_emails."email",
      MAX(raw_emails."displayName") AS "displayName"
    FROM raw_emails
    WHERE raw_emails."email" LIKE '%@%'
    GROUP BY raw_emails."email"
    ORDER BY raw_emails."email" ASC
  `);

  return rows
    .map((row) => ({
      email: cleanEmail(row.email),
      displayName: row.displayName?.trim() || null,
    }))
    .filter((row) => Boolean(row.email));
}

export async function getAnnouncementAlreadyQueuedEmails(templateId: string) {
  if (!templateId) return new Set<string>();

  const rows = await prisma.$queryRaw<Array<{ email: string }>>(Prisma.sql`
    SELECT DISTINCT
      LOWER(TRIM(COALESCE(recipient."emailNormalized", recipient."email"))) AS "email"
    FROM "NotificationDispatch" dispatch
    INNER JOIN "NotificationRecipient" recipient
      ON recipient."id" = dispatch."recipientId"
    WHERE dispatch."sourceType" = ${ANNOUNCEMENT_SOURCE_TYPE}
      AND dispatch."sourceId" = ${templateId}
      AND dispatch."status" IN ('QUEUED', 'PROCESSING', 'SENT')
      AND COALESCE(recipient."emailNormalized", recipient."email") IS NOT NULL
  `);

  return new Set(rows.map((row) => cleanEmail(row.email)).filter(Boolean));
}

export async function getAnnouncementTemplateCompatibility(input: {
  subject: string;
  body: string;
  ctaLabel: string | null;
  ctaUrlKey: string | null;
}) {
  const tokens = new Set([
    ...extractNotificationTokens(input.subject),
    ...extractNotificationTokens(input.body),
  ]);
  const unsupportedTokens = Array.from(tokens).filter(
    (token) => !SUPPORTED_ANNOUNCEMENT_TOKENS.has(token),
  );

  const unsupportedCta =
    input.ctaLabel && input.ctaUrlKey &&
    !["captainDashboardUrl", "signupUrl"].includes(input.ctaUrlKey)
      ? input.ctaUrlKey
      : null;

  return {
    unsupportedTokens,
    unsupportedCta,
    compatible: unsupportedTokens.length === 0 && !unsupportedCta,
  };
}

async function findOrCreateAnnouncementRecipient(person: SystemAnnouncementAudienceRow) {
  const matches = await prisma.$queryRaw<ExistingRecipientRow[]>(Prisma.sql`
    SELECT
      recipient."id",
      recipient."sourceType"::TEXT AS "sourceType",
      recipient."isSuppressed"
    FROM "NotificationRecipient" recipient
    WHERE LOWER(TRIM(COALESCE(recipient."emailNormalized", recipient."email"))) = ${person.email}
    ORDER BY recipient."createdAt" ASC
  `);

  if (matches.length > 0) {
    const suppressed = matches.find((recipient) => recipient.isSuppressed);
    if (suppressed) return suppressed.id;

    return [...matches].sort(
      (a, b) => getRecipientPriority(a.sourceType) - getRecipientPriority(b.sourceType),
    )[0]!.id;
  }

  const sourceId = `announcement-email-${createHash("sha256")
    .update(person.email)
    .digest("hex")}`;

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId,
    audience: NotificationAudience.GENERAL,
    displayName: person.displayName,
    email: person.email,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: false,
    marketingSmsOptIn: false,
    metadata: {
      createdForSystemAnnouncements: true,
    },
  });

  return recipient.id;
}

function resolveAnnouncementCta(input: {
  label: string | null;
  urlKey: string | null;
  dashboardUrl: string;
  signupUrl: string;
}) {
  const label = input.label?.trim() || "";
  const key = input.urlKey?.trim() || "";
  if (!label || !key) return undefined;

  if (key === "captainDashboardUrl") {
    return { label, url: input.dashboardUrl };
  }
  if (key === "signupUrl") {
    return { label, url: input.signupUrl };
  }

  return undefined;
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

  const compatibility = await getAnnouncementTemplateCompatibility({
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

  const [audience, alreadyQueuedEmails] = await Promise.all([
    getSystemAnnouncementAudience(),
    getAnnouncementAlreadyQueuedEmails(template.id),
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
        sourceId: template.id,
        variables: {
          firstName: firstName(person.displayName),
          name: displayName,
          fullName: displayName,
          link: dashboardUrl,
          captainDashboardUrl: dashboardUrl,
          signInUrl: dashboardUrl,
          signupUrl,
        },
        emailCta,
        metadata: {
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
