// ========================================
// File: src/lib/leads/teamPlaceConfirmation.ts
// ========================================

import { createHmac, timingSafeEqual } from "crypto";
import { LeadStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const TEAM_PLACE_CONFIRMATION_TEMPLATE_KEY = "team-place-confirmation-email";
export const TEAM_PLACE_CONFIRMATION_CTA_KEY = "teamConfirmationUrl";
export const TEAM_PLACE_CONFIRMATION_CTA_LABEL = "Yes, confirm our team place";

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for team confirmation links.");
  }

  return secret;
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function signLeadId(leadId: string) {
  return createHmac("sha256", getSecret()).update(leadId).digest("base64url");
}

export function createTeamPlaceConfirmationToken(leadId: string) {
  const cleanLeadId = leadId.trim();

  if (!cleanLeadId) {
    throw new Error("Lead ID is required for team confirmation links.");
  }

  return `${cleanLeadId}.${signLeadId(cleanLeadId)}`;
}

export function verifyTeamPlaceConfirmationToken(token: string) {
  const cleanToken = token.trim();
  const [leadId, signature, ...extra] = cleanToken.split(".");

  if (!leadId || !signature || extra.length > 0) return null;

  const expectedSignature = signLeadId(leadId);

  try {
    const supplied = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (supplied.length !== expected.length) return null;
    if (!timingSafeEqual(supplied, expected)) return null;

    return leadId;
  } catch {
    return null;
  }
}

export function getTeamPlaceConfirmationUrl(leadId: string) {
  const token = createTeamPlaceConfirmationToken(leadId);
  return `${getSiteUrl()}/team-confirmation/${encodeURIComponent(token)}`;
}

export async function ensureTeamPlaceConfirmationRecord(leadId: string) {
  const cleanLeadId = leadId.trim();
  const token = createTeamPlaceConfirmationToken(cleanLeadId);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "LeadTeamConfirmation" (
      "id", "leadId", "token", "status", "sentAt", "createdAt", "updatedAt"
    ) VALUES (
      ${cryptoRandomId()}, ${cleanLeadId}, ${token}, 'PENDING'::"LeadTeamConfirmationStatus", NOW(), NOW(), NOW()
    )
    ON CONFLICT ("leadId") DO UPDATE SET
      "token" = EXCLUDED."token",
      "status" = CASE
        WHEN "LeadTeamConfirmation"."status" = 'CONFIRMED'::"LeadTeamConfirmationStatus" THEN "LeadTeamConfirmation"."status"
        ELSE 'PENDING'::"LeadTeamConfirmationStatus"
      END,
      "sentAt" = NOW(),
      "updatedAt" = NOW()
  `);

  return {
    token,
    url: getTeamPlaceConfirmationUrl(cleanLeadId),
  };
}

export async function confirmTeamPlaceFromLead(leadId: string) {
  const cleanLeadId = leadId.trim();
  const token = createTeamPlaceConfirmationToken(cleanLeadId);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "LeadTeamConfirmation" (
        "id", "leadId", "token", "status", "confirmedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${cryptoRandomId()}, ${cleanLeadId}, ${token}, 'CONFIRMED'::"LeadTeamConfirmationStatus", NOW(), NOW(), NOW()
      )
      ON CONFLICT ("leadId") DO UPDATE SET
        "token" = EXCLUDED."token",
        "status" = 'CONFIRMED'::"LeadTeamConfirmationStatus",
        "confirmedAt" = NOW(),
        "declinedAt" = NULL,
        "updatedAt" = NOW()
    `);

    await tx.interestLead.update({
      where: { id: cleanLeadId },
      data: {
        status: LeadStatus.QUALIFIED,
        contactedAt: new Date(),
        closedAt: null,
      },
    });
  });
}

export async function declineTeamPlaceFromLead(leadId: string) {
  const cleanLeadId = leadId.trim();
  const token = createTeamPlaceConfirmationToken(cleanLeadId);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "LeadTeamConfirmation" (
        "id", "leadId", "token", "status", "declinedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${cryptoRandomId()}, ${cleanLeadId}, ${token}, 'DECLINED'::"LeadTeamConfirmationStatus", NOW(), NOW(), NOW()
      )
      ON CONFLICT ("leadId") DO UPDATE SET
        "token" = EXCLUDED."token",
        "status" = 'DECLINED'::"LeadTeamConfirmationStatus",
        "declinedAt" = NOW(),
        "confirmedAt" = NULL,
        "updatedAt" = NOW()
    `);

    await tx.interestLead.update({
      where: { id: cleanLeadId },
      data: {
        status: LeadStatus.CLOSED,
        closedAt: new Date(),
      },
    });
  });
}

export async function getTeamPlaceConfirmationStatus(leadId: string) {
  const rows = await prisma.$queryRaw<
    Array<{
      status: string;
      sentAt: Date | null;
      confirmedAt: Date | null;
      declinedAt: Date | null;
    }>
  >(Prisma.sql`
    SELECT
      "status"::text AS "status",
      "sentAt",
      "confirmedAt",
      "declinedAt"
    FROM "LeadTeamConfirmation"
    WHERE "leadId" = ${leadId}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

function cryptoRandomId() {
  return `cltc_${cryptoRandomString()}`;
}

function cryptoRandomString() {
  return createHmac("sha256", getSecret())
    .update(`${Date.now()}-${Math.random()}-${process.hrtime.bigint().toString()}`)
    .digest("hex")
    .slice(0, 24);
}
