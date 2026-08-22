import { prisma } from "@/lib/prisma";

export const BLOCKED_TEAM_OVERLAP_THRESHOLD = 4;

type TeamGuardRow = {
  registrationBlocked: boolean;
  registrationBlockedReason: string | null;
  registrationReviewRequired: boolean;
  registrationReviewReason: string | null;
};

type UserRestrictionRow = {
  id: string;
  name: string | null;
  email: string | null;
  teamManagementRestricted: boolean;
  teamManagementRestrictionReason: string | null;
  playingRestricted: boolean;
  playingRestrictedUntil: Date | null;
  playingRestrictionReason: string | null;
};

export type ParticipationIdentityRestriction = {
  userId: string;
  name: string | null;
  email: string | null;
  reason: string | null;
  until: Date | null;
};

function cleanEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function cleanPhoneDigits(value: string | null | undefined) {
  const digits = value?.replace(/[^0-9]/g, "") || "";
  if (!digits) return null;
  if (digits.startsWith("0")) return `44${digits.slice(1)}`;
  if (digits.startsWith("44")) return digits;
  return `44${digits}`;
}

export async function getTeamRegistrationGuard(teamId: string) {
  const rows = await prisma.$queryRawUnsafe<TeamGuardRow[]>(
    `
      SELECT
        COALESCE("registrationBlocked", false) AS "registrationBlocked",
        "registrationBlockedReason",
        COALESCE("registrationReviewRequired", false) AS "registrationReviewRequired",
        "registrationReviewReason"
      FROM "Team"
      WHERE "id" = $1
      LIMIT 1
    `,
    teamId,
  );

  return rows[0] ?? null;
}

export async function getUserParticipationRestriction(userId: string) {
  const rows = await prisma.$queryRawUnsafe<UserRestrictionRow[]>(
    `
      SELECT
        "id",
        "name",
        "email",
        COALESCE("teamManagementRestricted", false) AS "teamManagementRestricted",
        "teamManagementRestrictionReason",
        COALESCE("playingRestricted", false) AS "playingRestricted",
        "playingRestrictedUntil",
        "playingRestrictionReason"
      FROM "User"
      WHERE "id" = $1
      LIMIT 1
    `,
    userId,
  );

  const row = rows[0] ?? null;
  if (!row) return null;

  const playingRestrictionActive =
    row.playingRestricted &&
    (!row.playingRestrictedUntil || row.playingRestrictedUntil.getTime() > Date.now());

  return {
    ...row,
    playingRestrictionActive,
  };
}

export async function getActivePlayingRestrictionForIdentity(input: {
  email?: string | null;
  phone?: string | null;
}): Promise<ParticipationIdentityRestriction | null> {
  const email = cleanEmail(input.email);
  const phoneDigits = cleanPhoneDigits(input.phone);

  if (!email && !phoneDigits) return null;

  const rows = await prisma.$queryRawUnsafe<ParticipationIdentityRestriction[]>(
    `
      SELECT DISTINCT
        player_user."id" AS "userId",
        player_user."name" AS "name",
        player_user."email" AS "email",
        player_user."playingRestrictionReason" AS "reason",
        player_user."playingRestrictedUntil" AS "until"
      FROM "User" player_user
      LEFT JOIN "TeamMember" member ON member."userId" = player_user."id"
      LEFT JOIN "TeamMemberProfile" profile ON profile."teamMemberId" = member."id"
      WHERE COALESCE(player_user."playingRestricted", false) = true
        AND (
          player_user."playingRestrictedUntil" IS NULL
          OR player_user."playingRestrictedUntil" > NOW()
        )
        AND (
          ($1::text IS NOT NULL AND LOWER(BTRIM(COALESCE(player_user."email", ''))) = $1)
          OR
          ($2::text IS NOT NULL AND (
            CASE
              WHEN REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g') LIKE '0%'
                THEN '44' || SUBSTRING(REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g') FROM 2)
              WHEN REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g') LIKE '44%'
                THEN REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g')
              ELSE CASE
                WHEN REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g') = '' THEN NULL
                ELSE '44' || REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g')
              END
            END
          ) = $2)
        )
      LIMIT 1
    `,
    email,
    phoneDigits,
  );

  return rows[0] ?? null;
}

export async function getCaptainClaimRestriction(input: {
  teamId: string;
  userId: string;
}) {
  const [teamGuard, userRestriction] = await Promise.all([
    getTeamRegistrationGuard(input.teamId),
    getUserParticipationRestriction(input.userId),
  ]);

  if (teamGuard?.registrationBlocked) {
    return {
      blocked: true as const,
      code: "team_blocked" as const,
      reason: teamGuard.registrationBlockedReason,
    };
  }

  if (teamGuard?.registrationReviewRequired) {
    return {
      blocked: true as const,
      code: "team_review" as const,
      reason: teamGuard.registrationReviewReason,
    };
  }

  if (userRestriction?.teamManagementRestricted) {
    return {
      blocked: true as const,
      code: "management_restricted" as const,
      reason: userRestriction.teamManagementRestrictionReason,
    };
  }

  return { blocked: false as const };
}

export async function recordParticipationAudit(input: {
  subjectType: "TEAM" | "USER";
  subjectId: string;
  action: string;
  reason?: string | null;
  until?: Date | null;
  createdByUserId?: string | null;
}) {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "ParticipationRestrictionAudit" (
        "id",
        "subjectType",
        "subjectId",
        "action",
        "reason",
        "until",
        "createdByUserId",
        "createdAt"
      ) VALUES (
        gen_random_uuid()::text,
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        NOW()
      )
    `,
    input.subjectType,
    input.subjectId,
    input.action,
    input.reason ?? null,
    input.until ?? null,
    input.createdByUserId ?? null,
  );
}
