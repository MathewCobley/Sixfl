import { Prisma } from "@prisma/client";

import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { prisma } from "@/lib/prisma";

export type SharedEmailRepairInput = {
  sharedEmail: string;
  separateName: string;
  newEmail: string;
  newPhone?: string | null;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  teams: string | null;
};

type LeadRow = {
  id: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  leagueName: string | null;
};

type ProspectRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  teamName: string | null;
};

type RecipientSummaryRow = {
  total: bigint;
  playerSources: bigint;
  leadSources: bigint;
  otherSources: bigint;
};

type PlayerRecipientTruthRow = {
  recipientId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
};

export type SharedEmailRepairPreview = {
  input: {
    sharedEmail: string;
    separateName: string;
    newEmail: string;
    newPhone: string | null;
  };
  sharedEmailUser: UserRow | null;
  separateUserOnSharedEmail: UserRow | null;
  newEmailUser: UserRow | null;
  leads: LeadRow[];
  prospects: ProspectRow[];
  recipients: {
    total: number;
    playerSources: number;
    leadSources: number;
    otherSources: number;
  };
  blockers: string[];
  warnings: string[];
  canApply: boolean;
};

export type SharedEmailRepairResult = {
  usersUpdated: number;
  leadsUpdated: number;
  prospectsUpdated: number;
  playerPoolProfilesUpdated: number;
  leadRecipientsUpdated: number;
  prospectRecipientsUpdated: number;
  playerSourceRecipientsResynced: number;
  unresolvedRecipientsLeft: number;
};

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normaliseName(value: string) {
  return cleanName(value).toLowerCase();
}

function normaliseEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
}

function cleanPhone(value?: string | null) {
  if (!value?.trim()) return null;
  return normalizePhoneNumber(value);
}

function normaliseInput(input: SharedEmailRepairInput) {
  const sharedEmail = normaliseEmail(input.sharedEmail);
  const newEmail = normaliseEmail(input.newEmail);
  const separateName = cleanName(input.separateName);
  const separateNameNormalised = normaliseName(input.separateName);
  const newPhone = cleanPhone(input.newPhone);

  return {
    sharedEmail,
    newEmail,
    separateName,
    separateNameNormalised,
    newPhone,
  };
}

async function userByEmail(email: string): Promise<UserRow | null> {
  const rows = await prisma.$queryRaw<UserRow[]>(Prisma.sql`
    SELECT
      player_user."id",
      player_user."name",
      player_user."email",
      NULLIF(STRING_AGG(DISTINCT team."name", ', ' ORDER BY team."name"), '') AS "teams"
    FROM "User" player_user
    LEFT JOIN "TeamMember" member ON member."userId" = player_user."id"
    LEFT JOIN "Team" team ON team."id" = member."teamId"
    WHERE LOWER(BTRIM(COALESCE(player_user."email", ''))) = ${email}
    GROUP BY player_user."id", player_user."name", player_user."email"
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function separateUserOnSharedEmail(input: {
  sharedEmail: string;
  separateNameNormalised: string;
}): Promise<UserRow | null> {
  const rows = await prisma.$queryRaw<UserRow[]>(Prisma.sql`
    SELECT
      player_user."id",
      player_user."name",
      player_user."email",
      NULLIF(STRING_AGG(DISTINCT team."name", ', ' ORDER BY team."name"), '') AS "teams"
    FROM "User" player_user
    LEFT JOIN "TeamMember" member ON member."userId" = player_user."id"
    LEFT JOIN "Team" team ON team."id" = member."teamId"
    WHERE LOWER(BTRIM(COALESCE(player_user."email", ''))) = ${input.sharedEmail}
      AND LOWER(REGEXP_REPLACE(BTRIM(COALESCE(player_user."name", '')), '[[:space:]]+', ' ', 'g')) = ${input.separateNameNormalised}
    GROUP BY player_user."id", player_user."name", player_user."email"
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function getSharedEmailRepairPreview(
  input: SharedEmailRepairInput,
): Promise<SharedEmailRepairPreview> {
  const parsed = normaliseInput(input);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!parsed.sharedEmail) blockers.push("Enter a valid shared/old email address.");
  if (!parsed.newEmail) blockers.push("Enter a valid new unique email address.");
  if (!parsed.separateName) blockers.push("Enter the full name of the person being separated.");
  if (parsed.sharedEmail && parsed.newEmail && parsed.sharedEmail === parsed.newEmail) {
    blockers.push("The new email must be different from the shared/old email.");
  }
  if (input.newPhone?.trim() && !parsed.newPhone) {
    blockers.push("The new mobile number is not valid.");
  }

  if (!parsed.sharedEmail || !parsed.newEmail || !parsed.separateName) {
    return {
      input: {
        sharedEmail: parsed.sharedEmail ?? input.sharedEmail.trim().toLowerCase(),
        separateName: parsed.separateName,
        newEmail: parsed.newEmail ?? input.newEmail.trim().toLowerCase(),
        newPhone: parsed.newPhone,
      },
      sharedEmailUser: null,
      separateUserOnSharedEmail: null,
      newEmailUser: null,
      leads: [],
      prospects: [],
      recipients: { total: 0, playerSources: 0, leadSources: 0, otherSources: 0 },
      blockers,
      warnings,
      canApply: false,
    };
  }

  const [sharedEmailUser, separateUser, newEmailUser, leads, prospects, recipientRows] =
    await Promise.all([
      userByEmail(parsed.sharedEmail),
      separateUserOnSharedEmail({
        sharedEmail: parsed.sharedEmail,
        separateNameNormalised: parsed.separateNameNormalised,
      }),
      userByEmail(parsed.newEmail),
      prisma.$queryRaw<LeadRow[]>(Prisma.sql`
        SELECT
          lead."id",
          lead."contactName",
          lead."email",
          lead."phone",
          league."name" AS "leagueName"
        FROM "InterestLead" lead
        LEFT JOIN "League" league ON league."id" = lead."leagueId"
        WHERE LOWER(REGEXP_REPLACE(BTRIM(COALESCE(lead."contactName", '')), '[[:space:]]+', ' ', 'g')) = ${parsed.separateNameNormalised}
          AND LOWER(BTRIM(COALESCE(lead."email", ''))) = ${parsed.sharedEmail}
        ORDER BY lead."createdAt" DESC
      `),
      prisma.$queryRaw<ProspectRow[]>(Prisma.sql`
        SELECT
          prospect."id",
          prospect."firstName",
          prospect."lastName",
          prospect."email",
          prospect."phone",
          prospect."status",
          team."name" AS "teamName"
        FROM "TeamPlayerProspect" prospect
        LEFT JOIN "Team" team ON team."id" = prospect."teamId"
        WHERE LOWER(
          REGEXP_REPLACE(
            BTRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")),
            '[[:space:]]+', ' ', 'g'
          )
        ) = ${parsed.separateNameNormalised}
          AND LOWER(BTRIM(COALESCE(prospect."email", ''))) = ${parsed.sharedEmail}
        ORDER BY prospect."updatedAt" DESC
      `),
      prisma.$queryRaw<RecipientSummaryRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS "total",
          COUNT(*) FILTER (
            WHERE "sourceId" LIKE 'player-match-fee:%'
               OR "sourceId" LIKE 'fixture-selection:%'
               OR "sourceId" LIKE 'team-prospect:%'
          ) AS "playerSources",
          COUNT(*) FILTER (WHERE "sourceType"::text = 'LEAD') AS "leadSources",
          COUNT(*) FILTER (
            WHERE NOT (
              "sourceId" LIKE 'player-match-fee:%'
              OR "sourceId" LIKE 'fixture-selection:%'
              OR "sourceId" LIKE 'team-prospect:%'
              OR "sourceType"::text = 'LEAD'
            )
          ) AS "otherSources"
        FROM "NotificationRecipient"
        WHERE LOWER(COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), ''))) = ${parsed.sharedEmail}
      `),
    ]);

  if (newEmailUser && newEmailUser.id !== separateUser?.id) {
    blockers.push(
      `The new email is already attached to ${newEmailUser.name || "another User"}. Choose a genuinely unique email before applying this repair.`,
    );
  }

  if (sharedEmailUser && !separateUser) {
    warnings.push(
      `The User account currently holding the shared email is ${sharedEmailUser.name || "unnamed"}${sharedEmailUser.teams ? ` (${sharedEmailUser.teams})` : ""}. That User and all of their football history will be left untouched.`,
    );
  }

  if (separateUser) {
    warnings.push(
      `A User account for ${separateUser.name || parsed.separateName} currently uses the shared email. Its User ID will stay the same; only its login email will change, so its football history remains attached to the same person.`,
    );
  } else {
    warnings.push(
      `No User account for ${parsed.separateName} currently uses the shared email. The repair will update matching lead/prospect identities and communication metadata; it will not create a User until the player is actually added to a squad.`,
    );
  }

  if (leads.length === 0 && prospects.length === 0 && !separateUser) {
    warnings.push(
      "No exact-name lead, prospect or User currently uses the shared email. Only player-source notification metadata can be re-synchronised, so check the spelling before applying.",
    );
  }

  const recipientSummary = recipientRows[0] ?? {
    total: BigInt(0),
    playerSources: BigInt(0),
    leadSources: BigInt(0),
    otherSources: BigInt(0),
  };

  return {
    input: {
      sharedEmail: parsed.sharedEmail,
      separateName: parsed.separateName,
      newEmail: parsed.newEmail,
      newPhone: parsed.newPhone,
    },
    sharedEmailUser,
    separateUserOnSharedEmail: separateUser,
    newEmailUser,
    leads,
    prospects,
    recipients: {
      total: Number(recipientSummary.total),
      playerSources: Number(recipientSummary.playerSources),
      leadSources: Number(recipientSummary.leadSources),
      otherSources: Number(recipientSummary.otherSources),
    },
    blockers,
    warnings,
    canApply: blockers.length === 0,
  };
}

async function ensureRepairAuditTable(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SharedEmailRepairAudit" (
      "id" TEXT PRIMARY KEY,
      "sharedEmail" TEXT NOT NULL,
      "separateName" TEXT NOT NULL,
      "newEmail" TEXT NOT NULL,
      "newPhone" TEXT,
      "actorUserId" TEXT,
      "actorEmail" TEXT,
      "summary" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function loadPlayerRecipientTruth(
  tx: Prisma.TransactionClient,
  sharedEmail: string,
): Promise<PlayerRecipientTruthRow[]> {
  const feeRows = await tx.$queryRaw<PlayerRecipientTruthRow[]>(Prisma.sql`
    SELECT
      recipient."id" AS "recipientId",
      COALESCE(
        NULLIF(BTRIM(player_user."name"), ''),
        NULLIF(BTRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")), '')
      ) AS "displayName",
      COALESCE(NULLIF(BTRIM(player_user."email"), ''), NULLIF(BTRIM(prospect."email"), '')) AS "email",
      COALESCE(NULLIF(BTRIM(profile."phone"), ''), NULLIF(BTRIM(prospect."phone"), '')) AS "phone"
    FROM "NotificationRecipient" recipient
    JOIN "PlayerMatchFee" fee
      ON recipient."sourceId" = 'player-match-fee:' || fee."id"
    LEFT JOIN "TeamMember" member ON member."id" = fee."teamMemberId"
    LEFT JOIN "User" player_user ON player_user."id" = member."userId"
    LEFT JOIN "TeamMemberProfile" profile ON profile."teamMemberId" = member."id"
    LEFT JOIN "TeamPlayerProspect" prospect ON prospect."id" = fee."prospectId"
    WHERE LOWER(COALESCE(NULLIF(BTRIM(recipient."emailNormalized"), ''), NULLIF(BTRIM(recipient."email"), ''))) = ${sharedEmail}
  `);

  const selectionRows = await tx.$queryRaw<PlayerRecipientTruthRow[]>(Prisma.sql`
    SELECT
      recipient."id" AS "recipientId",
      NULLIF(BTRIM(player_user."name"), '') AS "displayName",
      NULLIF(BTRIM(player_user."email"), '') AS "email",
      NULLIF(BTRIM(profile."phone"), '') AS "phone"
    FROM "NotificationRecipient" recipient
    JOIN "FixtureSelection" selection
      ON recipient."sourceId" = 'fixture-selection:' || selection."fixtureId" || ':' || selection."teamMemberId"
    JOIN "TeamMember" member ON member."id" = selection."teamMemberId"
    JOIN "User" player_user ON player_user."id" = member."userId"
    LEFT JOIN "TeamMemberProfile" profile ON profile."teamMemberId" = member."id"
    WHERE LOWER(COALESCE(NULLIF(BTRIM(recipient."emailNormalized"), ''), NULLIF(BTRIM(recipient."email"), ''))) = ${sharedEmail}
  `);

  const prospectRows = await tx.$queryRaw<PlayerRecipientTruthRow[]>(Prisma.sql`
    SELECT
      recipient."id" AS "recipientId",
      NULLIF(BTRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")), '') AS "displayName",
      NULLIF(BTRIM(prospect."email"), '') AS "email",
      NULLIF(BTRIM(prospect."phone"), '') AS "phone"
    FROM "NotificationRecipient" recipient
    JOIN "TeamPlayerProspect" prospect
      ON recipient."sourceId" = 'team-prospect:' || prospect."id"
    WHERE LOWER(COALESCE(NULLIF(BTRIM(recipient."emailNormalized"), ''), NULLIF(BTRIM(recipient."email"), ''))) = ${sharedEmail}
  `);

  return [...feeRows, ...selectionRows, ...prospectRows];
}

export async function applySharedEmailRepair(input: {
  repair: SharedEmailRepairInput;
  actorUserId?: string | null;
  actorEmail?: string | null;
}): Promise<SharedEmailRepairResult> {
  const preview = await getSharedEmailRepairPreview(input.repair);
  if (!preview.canApply) {
    throw new Error(preview.blockers[0] || "This shared-email repair is not safe to apply.");
  }

  const { sharedEmail, separateName, newEmail, newPhone } = preview.input;
  const separateNameNormalised = normaliseName(separateName);

  return prisma.$transaction(async (tx) => {
    await ensureRepairAuditTable(tx);

    const currentNewEmailUser = await tx.user.findFirst({
      where: { email: { equals: newEmail, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (currentNewEmailUser && currentNewEmailUser.id !== preview.separateUserOnSharedEmail?.id) {
      throw new Error(
        `The new email became attached to ${currentNewEmailUser.name || "another User"}. Nothing was changed.`,
      );
    }

    let usersUpdated = 0;
    if (preview.separateUserOnSharedEmail) {
      const updated = await tx.user.updateMany({
        where: {
          id: preview.separateUserOnSharedEmail.id,
          email: { equals: sharedEmail, mode: "insensitive" },
        },
        data: { email: newEmail },
      });
      usersUpdated = updated.count;

      if (newPhone) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "TeamMemberProfile" profile
          SET "phone" = ${newPhone}, "updatedAt" = NOW()
          FROM "TeamMember" member
          WHERE profile."teamMemberId" = member."id"
            AND member."userId" = ${preview.separateUserOnSharedEmail.id}
        `);
      }
    }

    const leadIds = preview.leads.map((lead) => lead.id);
    let leadsUpdated = 0;
    if (leadIds.length) {
      const updated = await tx.interestLead.updateMany({
        where: { id: { in: leadIds } },
        data: {
          email: newEmail,
          ...(newPhone ? { phone: newPhone, phoneNormalized: newPhone } : {}),
        },
      });
      leadsUpdated = updated.count;
    }

    const prospectIds = preview.prospects.map((prospect) => prospect.id);
    let prospectsUpdated = 0;
    if (prospectIds.length) {
      const updated = await tx.teamPlayerProspect.updateMany({
        where: { id: { in: prospectIds } },
        data: {
          email: newEmail,
          ...(newPhone ? { phone: newPhone } : {}),
        },
      });
      prospectsUpdated = updated.count;
    }

    let playerPoolProfilesUpdated = 0;
    if (prospectIds.length) {
      const tableRows = await tx.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
        SELECT to_regclass('"PlayerPoolProfile"') IS NOT NULL AS "exists"
      `);
      if (tableRows[0]?.exists) {
        playerPoolProfilesUpdated = await tx.$executeRaw(Prisma.sql`
          UPDATE "PlayerPoolProfile"
          SET "emailNormalized" = ${newEmail}, "updatedAt" = NOW()
          WHERE "prospectId" IN (${Prisma.join(prospectIds)})
        `);
      }
    }

    let leadRecipientsUpdated = 0;
    if (leadIds.length) {
      const updated = await tx.notificationRecipient.updateMany({
        where: {
          sourceType: "LEAD",
          sourceId: { in: leadIds },
        },
        data: {
          displayName: separateName,
          email: newEmail,
          emailNormalized: newEmail,
          ...(newPhone ? { phone: newPhone, phoneNormalized: newPhone } : {}),
          lastSyncedAt: new Date(),
        },
      });
      leadRecipientsUpdated = updated.count;
    }

    let prospectRecipientsUpdated = 0;
    if (prospectIds.length) {
      const prospectSourceIds = prospectIds.map((id) => `team-prospect:${id}`);
      const updated = await tx.notificationRecipient.updateMany({
        where: { sourceId: { in: prospectSourceIds } },
        data: {
          displayName: separateName,
          email: newEmail,
          emailNormalized: newEmail,
          ...(newPhone ? { phone: newPhone, phoneNormalized: newPhone } : {}),
          lastSyncedAt: new Date(),
        },
      });
      prospectRecipientsUpdated = updated.count;
    }

    const sourceTruth = await loadPlayerRecipientTruth(tx, sharedEmail);
    let playerSourceRecipientsResynced = 0;
    for (const truth of sourceTruth) {
      if (!truth.displayName && !truth.email && !truth.phone) continue;
      const email = truth.email?.trim().toLowerCase() || null;
      const phone = truth.phone ? normalizePhoneNumber(truth.phone) : null;
      await tx.notificationRecipient.update({
        where: { id: truth.recipientId },
        data: {
          displayName: truth.displayName?.trim() || null,
          email,
          emailNormalized: email,
          phone,
          phoneNormalized: phone,
          lastSyncedAt: new Date(),
        },
      });
      playerSourceRecipientsResynced += 1;
    }

    const unresolvedRows = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS "count"
      FROM "NotificationRecipient"
      WHERE LOWER(COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), ''))) = ${sharedEmail}
        AND LOWER(REGEXP_REPLACE(BTRIM(COALESCE("displayName", '')), '[[:space:]]+', ' ', 'g')) = ${separateNameNormalised}
    `);
    const unresolvedRecipientsLeft = Number(unresolvedRows[0]?.count ?? BigInt(0));

    const result: SharedEmailRepairResult = {
      usersUpdated,
      leadsUpdated,
      prospectsUpdated,
      playerPoolProfilesUpdated,
      leadRecipientsUpdated,
      prospectRecipientsUpdated,
      playerSourceRecipientsResynced,
      unresolvedRecipientsLeft,
    };

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "SharedEmailRepairAudit" (
        "id", "sharedEmail", "separateName", "newEmail", "newPhone",
        "actorUserId", "actorEmail", "summary", "createdAt"
      ) VALUES (
        ${crypto.randomUUID()}, ${sharedEmail}, ${separateName}, ${newEmail}, ${newPhone},
        ${input.actorUserId ?? null}, ${input.actorEmail ?? null},
        ${JSON.stringify(result)}::jsonb, NOW()
      )
    `);

    return result;
  });
}
