import { randomUUID } from "node:crypto";
import { Prisma, TeamRole } from "@prisma/client";

import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { prisma } from "@/lib/prisma";

type AddPlayerInput = {
  teamId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  usesWhatsapp: boolean;
  attemptedByUserId: string | null;
  attemptedByEmail: string | null;
};

type DuplicateResult = {
  ok: false;
  code:
    | "MISSING_IDENTITY"
    | "ALREADY_IN_TEAM"
    | "AMBIGUOUS_IDENTITY"
    | "EXISTING_PROSPECT"
    | "EMAIL_CONFLICT";
  message: string;
  matchedRecordId?: string | null;
  matchedTeamId?: string | null;
  matchedType?: string | null;
};

type AddedResult = {
  ok: true;
  membershipId: string;
  userId: string;
  reusedExistingUser: boolean;
};

export type AddPlayerWithoutDuplicatesResult = DuplicateResult | AddedResult;

type PhoneLinkedUserRow = {
  membershipId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  teamId: string;
  teamName: string;
  phone: string | null;
};

type SameTeamNameRow = {
  membershipId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
};

type ProspectRow = {
  id: string;
  teamId: string | null;
  teamName: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

function normaliseName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normaliseEmail(value: string | null) {
  const email = value?.trim().toLowerCase() ?? "";
  return email || null;
}

async function recordBlockedAttempt(
  tx: Prisma.TransactionClient,
  input: AddPlayerInput,
  result: DuplicateResult,
) {
  await tx.$executeRaw`
    INSERT INTO "PlayerDuplicateAttempt" (
      "id",
      "teamId",
      "attemptedByUserId",
      "attemptedByEmail",
      "displayName",
      "email",
      "phone",
      "matchType",
      "matchedRecordId",
      "matchedTeamId",
      "reason",
      "createdAt"
    ) VALUES (
      ${randomUUID()},
      ${input.teamId},
      ${input.attemptedByUserId},
      ${input.attemptedByEmail},
      ${input.displayName},
      ${input.email},
      ${input.phone},
      ${result.matchedType ?? result.code},
      ${result.matchedRecordId ?? null},
      ${result.matchedTeamId ?? null},
      ${result.message},
      NOW()
    )
  `;
}

async function block(
  tx: Prisma.TransactionClient,
  input: AddPlayerInput,
  result: DuplicateResult,
): Promise<DuplicateResult> {
  await recordBlockedAttempt(tx, input, result).catch(() => undefined);
  return result;
}

export async function addPlayerToTeamWithoutDuplicates(
  input: AddPlayerInput,
): Promise<AddPlayerWithoutDuplicatesResult> {
  const displayName = input.displayName.trim().replace(/\s+/g, " ");
  const email = normaliseEmail(input.email);
  const phone = normalizePhoneNumber(input.phone);
  const normalisedPlayerName = normaliseName(displayName);

  return prisma.$transaction(async (tx) => {
    const lockKey = email ? `player-email:${email}` : phone ? `player-phone:${phone}` : `player-name:${input.teamId}:${normalisedPlayerName}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    if (!email && !phone) {
      return block(tx, input, {
        ok: false,
        code: "MISSING_IDENTITY",
        message:
          "Add an email address or mobile number. Name-only player records are no longer allowed because they create duplicates.",
      });
    }

    const sameTeamNameRows = await tx.$queryRaw<SameTeamNameRow[]>`
      SELECT
        member."id" AS "membershipId",
        player_user."id" AS "userId",
        player_user."name" AS "userName",
        player_user."email" AS "userEmail"
      FROM "TeamMember" member
      INNER JOIN "User" player_user ON player_user."id" = member."userId"
      WHERE member."teamId" = ${input.teamId}
        AND LOWER(
          REGEXP_REPLACE(
            BTRIM(COALESCE(player_user."name", '')),
            '[[:space:]]+',
            ' ',
            'g'
          )
        ) = ${normalisedPlayerName}
      LIMIT 1
    `;

    if (sameTeamNameRows[0]) {
      return block(tx, input, {
        ok: false,
        code: "ALREADY_IN_TEAM",
        message:
          "A player with this name is already in the squad. Open and update the existing player instead of creating another record.",
        matchedType: "TEAM_MEMBER_NAME",
        matchedRecordId: sameTeamNameRows[0].membershipId,
        matchedTeamId: input.teamId,
      });
    }

    const emailUser = email
      ? await tx.user.findFirst({
          where: {
            email: { equals: email, mode: "insensitive" },
          },
          select: { id: true, name: true, email: true },
        })
      : null;

    const phoneLinkedUsers = phone
      ? await tx.$queryRaw<PhoneLinkedUserRow[]>`
          WITH profile_phones AS (
            SELECT
              profile."teamMemberId",
              profile."phone",
              CASE
                WHEN REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g') LIKE '0%'
                  THEN '44' || SUBSTRING(
                    REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g')
                    FROM 2
                  )
                WHEN REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g') LIKE '44%'
                  THEN REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g')
                ELSE '44' || REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g')
              END AS "phoneNormalized"
            FROM "TeamMemberProfile" profile
            WHERE NULLIF(BTRIM(profile."phone"), '') IS NOT NULL
          )
          SELECT
            member."id" AS "membershipId",
            player_user."id" AS "userId",
            player_user."name" AS "userName",
            player_user."email" AS "userEmail",
            team."id" AS "teamId",
            team."name" AS "teamName",
            profile_phones."phone" AS "phone"
          FROM profile_phones
          INNER JOIN "TeamMember" member ON member."id" = profile_phones."teamMemberId"
          INNER JOIN "User" player_user ON player_user."id" = member."userId"
          INNER JOIN "Team" team ON team."id" = member."teamId"
          WHERE profile_phones."phoneNormalized" = ${phone.replace(/^\+/, "")}
        `
      : [];

    const currentTeamPhoneMatch = phoneLinkedUsers.find(
      (candidate) => candidate.teamId === input.teamId,
    );
    if (currentTeamPhoneMatch) {
      return block(tx, input, {
        ok: false,
        code: "ALREADY_IN_TEAM",
        message:
          "That mobile number is already attached to a player in this squad. Update the existing player instead.",
        matchedType: "TEAM_MEMBER_PHONE",
        matchedRecordId: currentTeamPhoneMatch.membershipId,
        matchedTeamId: input.teamId,
      });
    }

    const distinctPhoneUserIds = Array.from(
      new Set(phoneLinkedUsers.map((candidate) => candidate.userId)),
    );
    if (distinctPhoneUserIds.length > 1) {
      return block(tx, input, {
        ok: false,
        code: "AMBIGUOUS_IDENTITY",
        message:
          "That mobile number is attached to more than one existing player record. SIXFL must merge those records before this player can be added.",
        matchedType: "AMBIGUOUS_PHONE",
      });
    }

    const phoneUser = phoneLinkedUsers[0] ?? null;

    if (emailUser && phoneUser && emailUser.id !== phoneUser.userId) {
      return block(tx, input, {
        ok: false,
        code: "AMBIGUOUS_IDENTITY",
        message:
          "The email address and mobile number belong to different existing player records. SIXFL must resolve them before the player can be added.",
        matchedType: "EMAIL_PHONE_CONFLICT",
        matchedRecordId: emailUser.id,
      });
    }

    if (
      phoneUser?.userEmail &&
      email &&
      phoneUser.userEmail.trim().toLowerCase() !== email
    ) {
      return block(tx, input, {
        ok: false,
        code: "EMAIL_CONFLICT",
        message:
          "That mobile number already belongs to a player with a different email address. Ask SIXFL to check the existing record.",
        matchedType: "PHONE_EMAIL_CONFLICT",
        matchedRecordId: phoneUser.userId,
        matchedTeamId: phoneUser.teamId,
      });
    }

    const existingUserId = emailUser?.id ?? phoneUser?.userId ?? null;

    if (existingUserId) {
      const existingMembership = await tx.teamMember.findUnique({
        where: {
          userId_teamId: {
            userId: existingUserId,
            teamId: input.teamId,
          },
        },
        select: { id: true },
      });

      if (existingMembership) {
        return block(tx, input, {
          ok: false,
          code: "ALREADY_IN_TEAM",
          message:
            "This player is already in the squad. Open and update the existing player instead.",
          matchedType: "TEAM_MEMBER",
          matchedRecordId: existingMembership.id,
          matchedTeamId: input.teamId,
        });
      }
    }

    if (!existingUserId) {
      const prospectMatches = await tx.$queryRaw<ProspectRow[]>`
        WITH prospect_contacts AS (
          SELECT
            prospect."id",
            prospect."teamId",
            team."name" AS "teamName",
            prospect."firstName",
            prospect."lastName",
            prospect."email",
            prospect."phone",
            prospect."status",
            LOWER(BTRIM(COALESCE(prospect."email", ''))) AS "emailNormalized",
            CASE
              WHEN REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g') LIKE '0%'
                THEN '44' || SUBSTRING(
                  REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g')
                  FROM 2
                )
              WHEN REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g') LIKE '44%'
                THEN REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g')
              ELSE '44' || REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g')
            END AS "phoneNormalized"
          FROM "TeamPlayerProspect" prospect
          LEFT JOIN "Team" team ON team."id" = prospect."teamId"
        )
        SELECT
          "id",
          "teamId",
          "teamName",
          "firstName",
          "lastName",
          "email",
          "phone",
          "status"
        FROM prospect_contacts
        WHERE (${email}::text IS NOT NULL AND "emailNormalized" = ${email})
           OR (${phone}::text IS NOT NULL AND "phoneNormalized" = ${phone?.replace(/^\+/, "") ?? null})
        ORDER BY "teamId" NULLS FIRST, "id"
        LIMIT 1
      `;

      if (prospectMatches[0]) {
        const match = prospectMatches[0];
        return block(tx, input, {
          ok: false,
          code: "EXISTING_PROSPECT",
          message: match.teamName
            ? `This player already has an existing record linked to ${match.teamName}. Ask SIXFL to reuse or move that record instead of creating another.`
            : "This player already exists in the PlayerPool or prospect system. Ask SIXFL to assign the existing record instead of creating another.",
          matchedType: "TEAM_PLAYER_PROSPECT",
          matchedRecordId: match.id,
          matchedTeamId: match.teamId,
        });
      }
    }

    let userId = existingUserId;
    let reusedExistingUser = Boolean(existingUserId);

    if (!userId) {
      const createdUser = await tx.user.create({
        data: {
          name: displayName,
          email,
        },
        select: { id: true },
      });
      userId = createdUser.id;
      reusedExistingUser = false;
    } else {
      const existingUser = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      if (!existingUser?.name?.trim()) {
        await tx.user.update({
          where: { id: userId },
          data: { name: displayName },
        });
      }
    }

    await tx.$executeRaw`
      UPDATE "User"
      SET "usesWhatsapp" = ${input.usesWhatsapp}
      WHERE "id" = ${userId}
    `;

    const member = await tx.teamMember.create({
      data: {
        userId,
        teamId: input.teamId,
        role: TeamRole.PLAYER,
      },
      select: { id: true },
    });

    if (phone) {
      await tx.$executeRaw`
        INSERT INTO "TeamMemberProfile" (
          "id",
          "teamMemberId",
          "phone",
          "updatedAt"
        ) VALUES (
          ${randomUUID()},
          ${member.id},
          ${phone},
          NOW()
        )
        ON CONFLICT ("teamMemberId") DO UPDATE SET
          "phone" = EXCLUDED."phone",
          "updatedAt" = NOW()
      `;
    }

    return {
      ok: true,
      membershipId: member.id,
      userId,
      reusedExistingUser,
    };
  });
}
