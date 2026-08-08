import { createHash } from "crypto";
import {
  NotificationAudience,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { extractNotificationTokens } from "@/lib/notifications/renderer";
import { prisma } from "@/lib/prisma";

export const ANNOUNCEMENT_SOURCE_TYPE = "ANNOUNCEMENT";

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

export function getAnnouncementFirstName(value: string | null) {
  return value?.trim().split(/\s+/)[0]?.trim() || "there";
}

/**
 * An announcement is one saved revision of an existing email template, not the
 * template forever. Re-submitting the same unchanged revision cannot duplicate
 * it; editing the subject/body/CTA produces a new fingerprint and therefore a
 * genuinely new announcement that can be sent again.
 */
export function getAnnouncementSourceId(input: {
  id: string;
  subject: string;
  body: string;
  ctaLabel: string | null;
  ctaUrlKey: string | null;
}) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        id: input.id,
        subject: input.subject,
        body: input.body,
        ctaLabel: input.ctaLabel ?? null,
        ctaUrlKey: input.ctaUrlKey ?? null,
      }),
    )
    .digest("hex")
    .slice(0, 32);

  return `${input.id}:${fingerprint}`;
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

export async function getAnnouncementAlreadyQueuedEmails(
  announcementSourceId: string,
) {
  if (!announcementSourceId) return new Set<string>();

  const rows = await prisma.$queryRaw<Array<{ email: string }>>(Prisma.sql`
    SELECT DISTINCT
      LOWER(TRIM(COALESCE(recipient."emailNormalized", recipient."email"))) AS "email"
    FROM "NotificationDispatch" dispatch
    INNER JOIN "NotificationRecipient" recipient
      ON recipient."id" = dispatch."recipientId"
    WHERE dispatch."sourceType" = ${ANNOUNCEMENT_SOURCE_TYPE}
      AND dispatch."sourceId" = ${announcementSourceId}
      AND dispatch."status" IN ('QUEUED', 'PROCESSING', 'SENT')
      AND COALESCE(recipient."emailNormalized", recipient."email") IS NOT NULL
  `);

  return new Set(rows.map((row) => cleanEmail(row.email)).filter(Boolean));
}

export function getAnnouncementTemplateCompatibility(input: {
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
    input.ctaLabel &&
    input.ctaUrlKey &&
    !["captainDashboardUrl", "signupUrl"].includes(input.ctaUrlKey)
      ? input.ctaUrlKey
      : null;

  return {
    unsupportedTokens,
    unsupportedCta,
    compatible: unsupportedTokens.length === 0 && !unsupportedCta,
  };
}

export async function findOrCreateAnnouncementRecipient(
  person: SystemAnnouncementAudienceRow,
) {
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

export function resolveAnnouncementCta(input: {
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
