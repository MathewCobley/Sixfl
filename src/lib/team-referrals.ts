import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { queueReferralRecordedEmail } from "@/lib/team-referral-notifications";

export const TEAM_REFERRAL_REWARD_PENCE = 7500;
export const TEAM_REFERRAL_REQUIRED_MATCHES = 3;

type ReferralCodeRow = { code: string };

function makeReferralCode() {
  return `SIX-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function getOrCreateReferralCode(userId: string) {
  const existing = await prisma.$queryRaw<ReferralCodeRow[]>`
    SELECT "code"
    FROM "TeamReferralCode"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  if (existing[0]?.code) return existing[0].code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeReferralCode();
    try {
      await prisma.$executeRaw`
        INSERT INTO "TeamReferralCode" ("userId", "code", "updatedAt")
        VALUES (${userId}, ${code}, CURRENT_TIMESTAMP)
        ON CONFLICT ("userId") DO NOTHING
      `;

      const created = await prisma.$queryRaw<ReferralCodeRow[]>`
        SELECT "code"
        FROM "TeamReferralCode"
        WHERE "userId" = ${userId}
        LIMIT 1
      `;
      if (created[0]?.code) return created[0].code;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }

  throw new Error("Unable to create referral code");
}

export async function attachReferralToLead(input: {
  interestLeadId: string;
  referralCode: string;
  leadEmail: string;
}) {
  const code = input.referralCode.trim().toUpperCase();
  if (!code) return false;

  const rows = await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT rc."userId"
    FROM "TeamReferralCode" rc
    INNER JOIN "User" u ON u."id" = rc."userId"
    WHERE UPPER(rc."code") = ${code}
      AND (u."email" IS NULL OR LOWER(u."email") <> LOWER(${input.leadEmail}))
    LIMIT 1
  `;

  const referrerUserId = rows[0]?.userId;
  if (!referrerUserId) return false;

  const referralId = randomUUID();
  const inserted = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "TeamReferral" (
      "id", "referrerUserId", "interestLeadId", "rewardPence", "requiredMatches", "updatedAt"
    )
    VALUES (
      ${referralId}, ${referrerUserId}, ${input.interestLeadId},
      ${TEAM_REFERRAL_REWARD_PENCE}, ${TEAM_REFERRAL_REQUIRED_MATCHES}, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("interestLeadId") DO NOTHING
    RETURNING "id"
  `;

  if (inserted[0]?.id) {
    try {
      await queueReferralRecordedEmail(inserted[0].id);
    } catch (error) {
      console.error("Referral confirmation email queue failed:", error);
    }
  }

  return true;
}

export type TeamReferralRow = {
  id: string;
  referrerUserId: string;
  referrerName: string | null;
  referrerEmail: string | null;
  leadName: string;
  leadEmail: string;
  leadTeamName: string | null;
  teamId: string | null;
  teamName: string | null;
  leagueName: string | null;
  rewardPence: number;
  requiredMatches: number;
  completedMatches: number;
  paidAt: Date | null;
  createdAt: Date;
};

export async function getTeamReferrals(referrerUserId?: string) {
  return prisma.$queryRaw<TeamReferralRow[]>`
    SELECT
      r."id",
      r."referrerUserId",
      u."name" AS "referrerName",
      u."email" AS "referrerEmail",
      l."contactName" AS "leadName",
      l."email" AS "leadEmail",
      l."teamName" AS "leadTeamName",
      t."id" AS "teamId",
      t."name" AS "teamName",
      lg."name" AS "leagueName",
      r."rewardPence",
      r."requiredMatches",
      COUNT(DISTINCT f."id")::int AS "completedMatches",
      r."paidAt",
      r."createdAt"
    FROM "TeamReferral" r
    INNER JOIN "User" u ON u."id" = r."referrerUserId"
    INNER JOIN "InterestLead" l ON l."id" = r."interestLeadId"
    LEFT JOIN "Team" t ON t."id" = l."convertedTeamId"
    LEFT JOIN "League" lg ON lg."id" = t."leagueId"
    LEFT JOIN "Fixture" f
      ON (f."homeTeamId" = t."id" OR f."awayTeamId" = t."id")
      AND f."status" = 'COMPLETED'
    WHERE (${referrerUserId ?? null}::text IS NULL OR r."referrerUserId" = ${referrerUserId ?? null})
    GROUP BY
      r."id", r."referrerUserId", u."name", u."email", l."contactName", l."email",
      l."teamName", t."id", t."name", lg."name", r."rewardPence",
      r."requiredMatches", r."paidAt", r."createdAt"
    ORDER BY r."createdAt" DESC
  `;
}

export function referralStatus(row: Pick<TeamReferralRow, "paidAt" | "completedMatches" | "requiredMatches">) {
  if (row.paidAt) return "PAID" as const;
  if (row.completedMatches >= row.requiredMatches) return "READY" as const;
  return "TRACKING" as const;
}
