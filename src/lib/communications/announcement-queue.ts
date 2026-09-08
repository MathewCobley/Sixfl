import { createHash } from "crypto";
import { Prisma, NotificationAudience, NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { queueDirectNotification } from "@/lib/notifications/service";
import { getPublicSiteUrl } from "@/lib/stripe/client";
import {
  ANNOUNCEMENT_SOURCE_TYPE, findOrCreateAnnouncementRecipient, getAnnouncementFirstName,
  getAnnouncementSourceId, getAnnouncementTemplateCompatibility, getSystemAnnouncementAudience,
  resolveAnnouncementCta, type SystemAnnouncementAudienceRow,
} from "./system-announcements";

export type AnnouncementProgress = {
  sourceId: string; total: number; recorded: number; remaining: number;
  queued: number; processing: number; sent: number; failed: number; skipped: number; cancelled: number;
  checkedAt: string;
};
export type AnnouncementReview = { templateId: string; sourceId: string; audienceKey: string };
type ReadDb = Pick<typeof prisma, "$queryRaw">;
type AnnouncementTemplate = {
  id: string; key: string; name: string; subject: string; body: string;
  ctaLabel: string | null; ctaUrlKey: string | null;
};
export class AnnouncementReviewError extends Error {}

export function getAnnouncementAudienceKey(audience: SystemAnnouncementAudienceRow[]) {
  return createHash("sha256").update(JSON.stringify([...new Set(audience.map((row) => row.email.trim().toLowerCase()))].sort())).digest("hex");
}

// Use the dispatch's immutable email snapshot where present. A later account email
// edit must not make an old announcement look unsent to its original address.
export async function getAnnouncementRecords(sourceId: string, db: ReadDb = prisma) {
  const rows = await db.$queryRaw<Array<{ email: string; status: string }>>(Prisma.sql`
    SELECT DISTINCT ON (LOWER(TRIM(COALESCE(NULLIF(d."metadata"->>'emailNormalized', ''), r."emailNormalized", r."email"))))
      LOWER(TRIM(COALESCE(NULLIF(d."metadata"->>'emailNormalized', ''), r."emailNormalized", r."email"))) AS "email",
      d."status"::text AS "status"
    FROM "NotificationDispatch" d
    JOIN "NotificationRecipient" r ON r."id" = d."recipientId"
    WHERE d."sourceType" = ${ANNOUNCEMENT_SOURCE_TYPE} AND d."sourceId" = ${sourceId}
      AND d."channel"::text = 'EMAIL'
    ORDER BY LOWER(TRIM(COALESCE(NULLIF(d."metadata"->>'emailNormalized', ''), r."emailNormalized", r."email"))),
      CASE d."status"::text WHEN 'SENT' THEN 0 WHEN 'PROCESSING' THEN 1 WHEN 'QUEUED' THEN 2
        WHEN 'FAILED' THEN 3 WHEN 'SKIPPED' THEN 4 ELSE 5 END, d."createdAt" DESC
  `);
  return new Map(rows.filter((row) => row.email).map((row) => [row.email, row.status]));
}

export async function getAnnouncementProgress(sourceId: string, audience: SystemAnnouncementAudienceRow[], db: ReadDb = prisma): Promise<AnnouncementProgress> {
  const records = await getAnnouncementRecords(sourceId, db);
  const emails = new Set(audience.map((row) => row.email));
  const result: AnnouncementProgress = {
    sourceId, total: emails.size, recorded: 0, remaining: 0,
    queued: 0, processing: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0, checkedAt: new Date().toISOString(),
  };
  for (const email of emails) {
    const status = records.get(email);
    if (!status) continue;
    result.recorded += 1;
    if (status === "QUEUED") result.queued += 1;
    else if (status === "PROCESSING") result.processing += 1;
    else if (status === "SENT") result.sent += 1;
    else if (status === "FAILED") result.failed += 1;
    else if (status === "SKIPPED") result.skipped += 1;
    else if (status === "CANCELLED") result.cancelled += 1;
  }
  result.remaining = Math.max(0, result.total - result.recorded);
  return result;
}

export function validateAnnouncementReview(review: AnnouncementReview) {
  if (!review.templateId || review.templateId.length > 200 ||
      !review.sourceId.startsWith(`${review.templateId}:`) ||
      !/^[a-f0-9]{32}$/.test(review.sourceId.slice(review.templateId.length + 1)) ||
      !/^[a-f0-9]{64}$/.test(review.audienceKey)) {
    throw new AnnouncementReviewError("Refresh the announcement and review it before queueing.");
  }
}

/** Read-only: never queues, retries, updates recipients or calls a provider. */
export async function readAnnouncementStatus(review: AnnouncementReview) {
  validateAnnouncementReview(review);
  const [template, audience] = await Promise.all([
    prisma.emailTemplate.findUnique({ where: { id: review.templateId } }), getSystemAnnouncementAudience(),
  ]);
  return {
    progress: await getAnnouncementProgress(review.sourceId, audience),
    reviewChanged: !template?.isActive || getAnnouncementSourceId(template) !== review.sourceId ||
      getAnnouncementAudienceKey(audience) !== review.audienceKey,
  };
}

/** Transactional deduplication covers double clicks, two tabs and lost responses. */
export async function queueAnnouncementRecipient(input: {
  person: SystemAnnouncementAudienceRow; template: AnnouncementTemplate; sourceId: string; actorUserId: string;
}, db: typeof prisma = prisma) {
  const { person, template, sourceId } = input;
  const recipientId = await findOrCreateAnnouncementRecipient(person);
  const site = getPublicSiteUrl();
  const dashboardUrl = `${site}/dashboard`;
  const signupUrl = `${site}/register-interest`;
  return db.$transaction(async (tx) => {
    // Transaction-local locks auto-release on commit, rollback or connection loss.
    await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${sourceId}), hashtext(${person.email}))`);
    const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT d."id" FROM "NotificationDispatch" d
      JOIN "NotificationRecipient" r ON r."id" = d."recipientId"
      WHERE d."sourceType" = ${ANNOUNCEMENT_SOURCE_TYPE} AND d."sourceId" = ${sourceId}
        AND d."channel"::text = 'EMAIL'
        AND LOWER(TRIM(COALESCE(NULLIF(d."metadata"->>'emailNormalized', ''), r."emailNormalized", r."email"))) = ${person.email}
      LIMIT 1
    `);
    // A failed or cancelled send needs deliberate review, not an automatic resend.
    if (existing.length) return "EXISTING";
    const recipient = await tx.notificationRecipient.findUnique({ where: { id: recipientId }, select: { email: true } });
    if (recipient?.email?.trim().toLowerCase() !== person.email) throw new Error("Recipient changed during queueing.");
    const displayName = person.displayName?.trim() || "there";
    const dispatch = await queueDirectNotification({
      recipientId, channel: NotificationChannel.EMAIL, audience: NotificationAudience.GENERAL,
      subject: template.subject, body: template.body, isTransactional: true,
      sourceType: ANNOUNCEMENT_SOURCE_TYPE, sourceId,
      variables: {
        firstName: getAnnouncementFirstName(person.displayName), name: displayName, fullName: displayName,
        link: dashboardUrl, captainDashboardUrl: dashboardUrl, signInUrl: dashboardUrl, signupUrl,
      },
      emailCta: resolveAnnouncementCta({ label: template.ctaLabel, urlKey: template.ctaUrlKey, dashboardUrl, signupUrl }),
      metadata: {
        announcementSourceId: sourceId, announcementTemplateId: template.id,
        announcementTemplateKey: template.key, announcementTemplateName: template.name, emailNormalized: person.email,
      },
      createdByUserId: input.actorUserId,
    }, tx);
    return dispatch.status;
  }, { maxWait: 10_000, timeout: 15_000 });
}

/** Only creates durable queue rows. Delivery belongs to the existing cron worker. */
export async function queueSystemAnnouncement(review: AnnouncementReview & { confirmed: boolean; actorUserId: string }) {
  validateAnnouncementReview(review);
  if (!review.confirmed) throw new AnnouncementReviewError("Confirm that you have reviewed the announcement before queueing it.");
  const [template, audience] = await Promise.all([
    prisma.emailTemplate.findUnique({ where: { id: review.templateId } }), getSystemAnnouncementAudience(),
  ]);
  if (!template?.isActive) throw new AnnouncementReviewError("That email template is missing or inactive.");
  if (getAnnouncementSourceId(template) !== review.sourceId || getAnnouncementAudienceKey(audience) !== review.audienceKey) {
    throw new AnnouncementReviewError("The template or contact list has changed. Refresh and review it again before queueing.");
  }
  if (!getAnnouncementTemplateCompatibility(template).compatible) {
    throw new AnnouncementReviewError("This template contains recipient-specific placeholders or a button that cannot be used for announcements.");
  }
  const recorded = await getAnnouncementRecords(review.sourceId);
  const remaining = audience.filter((person) => !recorded.has(person.email));
  let next = 0;
  let queueFailures = 0;
  // Bounded parallel database work, not hundreds of open connections or provider calls.
  await Promise.all(Array.from({ length: Math.min(4, remaining.length) }, async () => {
    while (next < remaining.length) {
      const person = remaining[next++];
      try {
        await queueAnnouncementRecipient({ person, template, sourceId: review.sourceId, actorUserId: review.actorUserId });
      } catch {
        queueFailures += 1;
        // Customer addresses, content and provider/database errors stay out of logs.
        console.error("[announcements] Recipient queue operation unconfirmed", { sourceId: review.sourceId });
      }
    }
  }));
  const progress = await getAnnouncementProgress(review.sourceId, audience);
  console.info("[announcements] Queueing completed", { sourceId: review.sourceId, recorded: progress.recorded, total: progress.total, queueFailures });
  return { progress, queueFailures };
}
