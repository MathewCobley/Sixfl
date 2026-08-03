import { prisma } from "@/lib/prisma";

type PlayerIdentityClient = {
  user: Pick<typeof prisma.user, "findFirst" | "create" | "update">;
  $queryRawUnsafe: typeof prisma.$queryRawUnsafe;
  $executeRawUnsafe: typeof prisma.$executeRawUnsafe;
};

type LinkedMembershipRow = {
  teamMemberId: string;
  teamId: string;
  teamName: string;
  sourceProspectId: string | null;
};

export type PlayerIdentityConflict = {
  code: "SHARED_EMAIL_DIFFERENT_PLAYER";
  existingUserId: string;
  existingName: string | null;
  existingEmail: string | null;
  existingTeamId: string | null;
  existingTeamNames: string[];
  message: string;
};

export type PlayerAccountResolution =
  | {
      ok: true;
      user: { id: string };
      reusedExistingUser: boolean;
    }
  | {
      ok: false;
      conflict: PlayerIdentityConflict;
    };

export function normalisePlayerIdentityName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function playerNamesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const leftKey = normalisePlayerIdentityName(left);
  const rightKey = normalisePlayerIdentityName(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

function buildConflictMessage(input: {
  displayName: string;
  email: string;
  existingName: string | null;
  existingTeamNames: string[];
}) {
  const existingIdentity =
    input.existingName?.trim() || "another existing SIXFL player";
  const teamContext = input.existingTeamNames.length
    ? ` (${input.existingTeamNames.join(", ")})`
    : "";

  return `${input.email} is already the login email for ${existingIdentity}${teamContext}. The system has kept ${input.displayName} separate and has not linked, renamed or merged either player account. Add a different login email for ${input.displayName} before activating their dashboard.`;
}

async function loadLinkedMemberships(
  client: PlayerIdentityClient,
  userId: string,
) {
  try {
    return await client.$queryRawUnsafe<LinkedMembershipRow[]>(
      `
        SELECT
          member."id" AS "teamMemberId",
          member."teamId",
          team."name" AS "teamName",
          profile."sourceProspectId"
        FROM "TeamMember" member
        INNER JOIN "Team" team ON team."id" = member."teamId"
        LEFT JOIN "TeamMemberProfile" profile
          ON profile."teamMemberId" = member."id"
        WHERE member."userId" = $1
        ORDER BY member."createdAt" ASC
      `,
      userId,
    );
  } catch {
    return [];
  }
}

async function recordConflict(input: {
  client: PlayerIdentityClient;
  teamId: string;
  prospectId: string;
  displayName: string;
  email: string;
  phone: string | null;
  existingUserId: string;
  existingTeamId: string | null;
  message: string;
  attemptedByUserId?: string | null;
  attemptedByEmail?: string | null;
  source: string;
}) {
  try {
    await input.client.$executeRawUnsafe(
      `
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
          md5(random()::text || clock_timestamp()::text || $1 || $2),
          $1,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          NOW()
        )
      `,
      input.teamId,
      input.prospectId,
      input.attemptedByUserId ?? null,
      input.attemptedByEmail ?? null,
      input.displayName,
      input.email,
      input.phone,
      `SHARED_EMAIL_DIFFERENT_PLAYER:${input.source}`,
      input.existingUserId,
      input.existingTeamId,
      `${input.message} Prospect ID: ${input.prospectId}.`,
    );
  } catch (error) {
    console.error("Could not record shared player email conflict", error);
  }
}

export async function resolveProspectPlayerAccount(input: {
  client: PlayerIdentityClient;
  teamId: string;
  prospectId: string;
  displayName: string;
  email: string;
  phone?: string | null;
  requiredUserId?: string | null;
  attemptedByUserId?: string | null;
  attemptedByEmail?: string | null;
  source: string;
}): Promise<PlayerAccountResolution> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim().replace(/\s+/g, " ");

  await input.client.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    `player-login-email:${email}`,
  );

  const existingUser = await input.client.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (!existingUser) {
    if (input.requiredUserId) {
      const message =
        "The signed-in account could not be matched to the email on this player record. No squad account was linked.";
      const conflict: PlayerIdentityConflict = {
        code: "SHARED_EMAIL_DIFFERENT_PLAYER",
        existingUserId: input.requiredUserId,
        existingName: null,
        existingEmail: email,
        existingTeamId: null,
        existingTeamNames: [],
        message,
      };
      await recordConflict({
        ...input,
        email,
        displayName,
        phone: input.phone ?? null,
        existingUserId: input.requiredUserId,
        existingTeamId: null,
        message,
      });
      return { ok: false, conflict };
    }

    const user = await input.client.user.create({
      data: {
        email,
        name: displayName || null,
      },
      select: { id: true },
    });

    return { ok: true, user, reusedExistingUser: false };
  }

  const linkedMemberships = await loadLinkedMemberships(
    input.client,
    existingUser.id,
  );
  const exactProspectLink = linkedMemberships.some(
    (membership) => membership.sourceProspectId === input.prospectId,
  );
  const differentProspectOnThisTeam = linkedMemberships.some(
    (membership) =>
      membership.teamId === input.teamId &&
      Boolean(membership.sourceProspectId) &&
      membership.sourceProspectId !== input.prospectId,
  );
  const namesMatch = playerNamesMatch(existingUser.name, displayName);
  const existingHasName = Boolean(
    normalisePlayerIdentityName(existingUser.name),
  );
  const existingTeamNames = Array.from(
    new Set(linkedMemberships.map((membership) => membership.teamName)),
  );
  const requiredUserMismatch = Boolean(
    input.requiredUserId && existingUser.id !== input.requiredUserId,
  );
  const unverifiedUsedAccount =
    linkedMemberships.length > 0 && !existingHasName && !exactProspectLink;

  if (
    requiredUserMismatch ||
    differentProspectOnThisTeam ||
    unverifiedUsedAccount ||
    (existingHasName && !namesMatch && !exactProspectLink)
  ) {
    const message = buildConflictMessage({
      displayName,
      email,
      existingName: existingUser.name,
      existingTeamNames,
    });
    const conflict: PlayerIdentityConflict = {
      code: "SHARED_EMAIL_DIFFERENT_PLAYER",
      existingUserId: existingUser.id,
      existingName: existingUser.name,
      existingEmail: existingUser.email,
      existingTeamId: linkedMemberships[0]?.teamId ?? null,
      existingTeamNames,
      message,
    };

    await recordConflict({
      ...input,
      email,
      displayName,
      phone: input.phone ?? null,
      existingUserId: existingUser.id,
      existingTeamId: conflict.existingTeamId,
      message,
    });

    return { ok: false, conflict };
  }

  if (!existingHasName && displayName) {
    await input.client.user.update({
      where: { id: existingUser.id },
      data: { name: displayName },
      select: { id: true },
    });
  }

  return {
    ok: true,
    user: { id: existingUser.id },
    reusedExistingUser: true,
  };
}
