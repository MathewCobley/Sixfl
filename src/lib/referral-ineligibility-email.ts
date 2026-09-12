import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildQueuedContentFromTemplate, queueNotificationFromTemplate } from "@/lib/notifications/service";
import { getUnresolvedEmailPlaceholderReason } from "@/lib/notifications/renderer";
import { REFERRAL_INELIGIBILITY_REASONS } from "@/lib/team-referral-eligibility-policy";

export const REFERRAL_INELIGIBLE_EMAIL_SOURCE = "team-referral-ineligible";
export const REFERRAL_INELIGIBLE_EMAIL_TEMPLATE = "team-referral-ineligible";
export class ReferralIneligibilityEmailError extends Error {}

// Match the application's extended Prisma client and its transaction delegates.
type Db = Pick<typeof prisma, "$queryRaw" | "user" | "notificationRecipient" | "notificationPreference" | "notificationTemplate" | "notificationDispatch">;
type PublicReferral = {
  id: string; referrerUserId: string; referrerName: string | null;
  referrerEmail: string | null; teamName: string; rewardPence: number;
  ineligibleAt: Date | null; ineligibleReasonCode: string | null; paidAt: Date | null;
};

async function assertAdmin(actorUserId: string, db: Db) {
  const actor = actorUserId ? await db.user.findUnique({ where: { id: actorUserId }, select: { role: true } }) : null;
  if (actor?.role !== "ADMIN") throw new ReferralIneligibilityEmailError("Administrator access is required.");
}

async function loadPublicReferral(referralId: string, db: Db, lock = false) {
  // Deliberate allowlist: never select private review notes, bank data or audit identity.
  const rows = await db.$queryRaw<PublicReferral[]>(Prisma.sql`
    SELECT r.id, r."referrerUserId", u.name AS "referrerName", u.email AS "referrerEmail",
      COALESCE(NULLIF(BTRIM(t.name), ''), NULLIF(BTRIM(l."teamName"), ''), 'your referred team') AS "teamName",
      r."rewardPence", r."ineligibleAt", r."ineligibleReasonCode", r."paidAt"
    FROM "TeamReferral" r
    JOIN "User" u ON u.id = r."referrerUserId"
    JOIN "InterestLead" l ON l.id = r."interestLeadId"
    LEFT JOIN "Team" t ON t.id = l."convertedTeamId"
    WHERE r.id = ${referralId}
    ${lock ? Prisma.sql`FOR UPDATE OF r` : Prisma.empty}
  `);
  const row = rows[0];
  if (!row) throw new ReferralIneligibilityEmailError("Referral not found.");
  if (!row.ineligibleAt || row.paidAt) throw new ReferralIneligibilityEmailError("Save an unpaid referral as not eligible before sending this update.");
  return row;
}

function publicVariables(row: PublicReferral) {
  const reason = REFERRAL_INELIGIBILITY_REASONS.find(item => item.value === row.ineligibleReasonCode);
  if (!reason) throw new ReferralIneligibilityEmailError("The saved eligibility reason is not recognised. No email was queued.");
  return {
    firstName: row.referrerName?.trim().split(/\s+/)[0] || "there",
    teamName: row.teamName,
    rewardAmount: new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(row.rewardPence / 100),
    eligibilityReason: reason.label,
    referralsUrl: "https://www.sixfl.co.uk/player/referrals",
  };
}

async function loadContent(row: PublicReferral, db: Db) {
  const template = await db.notificationTemplate.findUnique({ where: { key: REFERRAL_INELIGIBLE_EMAIL_TEMPLATE } });
  if (!template?.isActive || template.channel !== "EMAIL" || template.kind !== "TRANSACTIONAL" || template.audience !== "USER") {
    throw new ReferralIneligibilityEmailError("Enable the Referral not eligible email in System Templates. It must be a transactional user email.");
  }
  const variables = publicVariables(row);
  const content = buildQueuedContentFromTemplate({ template, variables });
  if (!content.subject?.trim() || getUnresolvedEmailPlaceholderReason({ channel: "EMAIL", ...content })) {
    throw new ReferralIneligibilityEmailError("Check the Referral not eligible email template for missing fields. No email was queued.");
  }
  return { variables, content };
}

const dispatchSelect = {
  id: true, status: true, subject: true, bodyText: true, sentAt: true,
  failureReason: true, recipient: { select: { email: true } },
} as const;

export async function getReferralIneligibilityEmailPanel(referralId: string, actorUserId: string) {
  await assertAdmin(actorUserId, prisma);
  const row = await loadPublicReferral(referralId, prisma);
  const record = await prisma.notificationDispatch.findFirst({
    where: { sourceType: REFERRAL_INELIGIBLE_EMAIL_SOURCE, sourceId: row.id },
    select: dispatchSelect,
  });
  if (record) return { record, email: record.recipient.email, subject: record.subject, body: record.bodyText, error: null };
  try {
    const { content } = await loadContent(row, prisma);
    return { record: null, email: row.referrerEmail, subject: content.subject, body: content.bodyText,
      error: row.referrerEmail?.trim() ? null : "The referrer has no email address. Add it to their account before sending." };
  } catch (error) {
    if (!(error instanceof ReferralIneligibilityEmailError)) throw error;
    return { record: null, email: row.referrerEmail, subject: null, body: "", error: error.message };
  }
}

export async function queueReferralIneligibilityEmail(input: {
  referralId: string; actorUserId: string; confirmed: boolean;
}) {
  if (!input.confirmed) throw new ReferralIneligibilityEmailError("Confirm that you want to email the referrer.");
  return prisma.$transaction(async tx => {
    await assertAdmin(input.actorUserId, tx);
    const row = await loadPublicReferral(input.referralId, tx, true);
    // All states count: repeated clicks do not recreate failed/skipped/sent notices.
    // Deliberate retries use the existing message queue and the SAME dispatch.
    const existing = await tx.notificationDispatch.findFirst({
      where: { sourceType: REFERRAL_INELIGIBLE_EMAIL_SOURCE, sourceId: row.id }, select: { id: true, status: true },
    });
    if (existing) return { dispatchId: existing.id, status: existing.status, existing: true };
    const { variables } = await loadContent(row, tx);
    const email = row.referrerEmail?.trim();
    if (!email) throw new ReferralIneligibilityEmailError("The referrer has no email address. Add it to their account before sending.");
    const recipient = await tx.notificationRecipient.upsert({
      where: { sourceType_sourceId: { sourceType: "USER", sourceId: row.referrerUserId } },
      update: { displayName: row.referrerName, email, emailNormalized: email.toLowerCase(), lastSyncedAt: new Date() },
      create: { sourceType: "USER", sourceId: row.referrerUserId, audience: "USER", displayName: row.referrerName, email, emailNormalized: email.toLowerCase() },
    });
    // Existing suppression and opt-out settings are never overwritten.
    await tx.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
    const dispatch = await queueNotificationFromTemplate({
      templateKey: REFERRAL_INELIGIBLE_EMAIL_TEMPLATE, recipientId: recipient.id,
      variables, sourceType: REFERRAL_INELIGIBLE_EMAIL_SOURCE, sourceId: row.id,
      metadata: { event: "team_referral.ineligible.email", referralId: row.id },
      createdByUserId: input.actorUserId,
    }, tx);
    return { dispatchId: dispatch.id, status: dispatch.status, existing: false };
  }, { maxWait: 5000, timeout: 15000 });
}
