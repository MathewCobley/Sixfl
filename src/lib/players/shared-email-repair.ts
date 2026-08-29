import { randomUUID } from "node:crypto";
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

type CountRow = {
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

function normalisePhone(value?: string | null) {
  if (!value?.trim()) return null;
  return normalizePhoneNumber(value);
}

function parseInput(input: SharedEmailRepairInput) {
  return {
    sharedEmail: normaliseEmail(input.sharedEmail),
    separateName: cleanName(input.separateName),
    separateNameNormalised: normaliseName(input.separateName),
    newEmail: normaliseEmail(input.newEmail),
    newPhone: normalisePhone(input.newPhone),
  };
}

async function getUserByEmail(email: string) {
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

async function getNamedUserOnEmail(email: string, name: string) {
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
      AND LOWER(REGEXP_REPLACE(BTRIM(COALESCE(player_user."name", '')), '[[:space:]]+', ' ', 'g')) = ${name}
    GROUP BY player_user."id", player_user."name", player_user."email"
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function getSharedEmailRepairPreview(
  input: SharedEmailRepairInput,
): Promise<SharedEmailRepairPreview> {
  const parsed = parseInput(input);
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

  const [sharedEmailUser, separateUserOnSharedEmail, newEmailUser, leads, prospects, counts] =
    await Promise.all([
      getUserByEmail(parsed.sharedEmail),
      getNamedUserOnEmail(parsed.sharedEmail, parsed.separateNameNormalised),
      getUserByEmail(parsed.newEmail),
      prisma.$queryRaw<LeadRow[]>(Prisma.sql`
        SELECT lead."id", lead."contactName", lead."email", lead."phone", league."name" AS "leagueName"
        FROM "InterestLead" lead
        LEFT JOIN "League" league ON league."id" = lead."leagueId"
        WHERE LOWER(REGEXP_REPLACE(BTRIM(COALESCE(lead."contactName", '')), '[[:space:]]+', ' ', 'g')) = ${parsed.separateNameNormalised}
          AND LOWER(BTRIM(COALESCE(lead."email", ''))) = ${parsed.sharedEmail}
        ORDER BY lead."createdAt" DESC
      `),
      prisma.$queryRaw<ProspectRow[]>(Prisma.sql`
        SELECT
          prospect."id", prospect."firstName", prospect."lastName", prospect."email", prospect."phone",
          prospect."status", team."name" AS "teamName"
        FROM "TeamPlayerProspect" prospect
        LEFT JOIN "Team" team ON team."id" = prospect."teamId"
        WHERE LOWER(REGEXP_REPLACE(BTRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")), '[[:space:]]+', ' ', 'g')) = ${parsed.separateNameNormalised}
          AND LOWER(BTRIM(COALESCE(prospect."email", ''))) = ${parsed.sharedEmail}
        ORDER BY prospect."updatedAt" DESC
      `),
      prisma.$queryRaw<CountRow[]>(Prisma.sql`
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

  if (newEmailUser && newEmailUser.id !== separateUserOnSharedEmail?.id) {
    blockers.push(
      `The new email is already attached to ${newEmailUser.name || "another User"}. Choose a genuinely unique email before applying this repair.`,
    );
  }

  if (sharedEmailUser && !separateUserOnSharedEmail) {
    warnings.push(
      `The User account currently holding the shared email is ${sharedEmailUser.name || "unnamed"}${sharedEmailUser.teams ? ` (${sharedEmailUser.teams})` : ""}. That User and all football history attached to that User ID will be left untouched.`,
    );
  }

  if (separateUserOnSharedEmail) {
    warnings.push(
      `A User account for ${separateUserOnSharedEmail.name || parsed.separateName} currently uses the shared email. Its User ID will stay the same; only its login email/contact will change, so its football history remains attached to the same person.`,
    );
  } else {
    warnings.push(
      `No User account for ${parsed.separateName} currently uses the shared email. This repair will not manufacture an unattached User; the player can be created normally afterwards using the new unique email.`,
    );
  }

  if (leads.length === 0 && prospects.length === 0 && !separateUserOnSharedEmail) {
    warnings.push(
      "No exact-name lead/prospect currently uses the old email. That is acceptable when the person has already moved to a new lead email: stale player-source communication metadata can still be corrected without moving football history.",
    );
  }

  const count = counts[0] ?? {
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
    separateUserOnSharedEmail,
    newEmailUser,
    leads,
    prospects,
    recipients: {
      total: Number(count.total),
      playerSources: Number(count.playerSources),
      leadSources: Number(count.leadSources),
      otherSources: Number(count.otherSources),
    },
    blockers,
    warnings,
    canApply: blockers.length === 0,
  };
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

    const newEmailHolder = await tx.user.findFirst({
      where: { email: { equals: newEmail, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (newEmailHolder && newEmailHolder.id !== preview.separateUserOnSharedEmail?.id) {
      throw new Error(
        `The new email became attached to ${newEmailHolder.name || "another User"}. Nothing was changed.`,
      );
    }

    let usersUpdated = 0;
    if (preview.separateUserOnSharedEmail) {
      const changed = await tx.user.updateMany({
        where: {
          id: preview.separateUserOnSharedEmail.id,
          email: { equals: sharedEmail, mode: "insensitive" },
        },
        data: { email: newEmail },
      });
      usersUpdated = changed.count;

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

    const leadIds = preview.leads.map((row) => row.id);
    let leadsUpdated = 0;
    if (leadIds.length) {
      const changed = await tx.interestLead.updateMany({
        where: { id: { in: leadIds } },
        data: {
          email: newEmail,
          ...(newPhone ? { phone: newPhone, phoneNormalized: newPhone } : {}),
        },
      });
      leadsUpdated = changed.count;
    }

    const prospectIds = preview.prospects.map((row) => row.id);
    let prospectsUpdated = 0;
    if (prospectIds.length) {
      const changed = await tx.teamPlayerProspect.updateMany({
        where: { id: { in: prospectIds } },
        data: {
          email: newEmail,
          ...(newPhone ? { phone: newPhone } : {}),
        },
      });
      prospectsUpdated = changed.count;
    }

    let playerPoolProfilesUpdated = 0;
    if (prospectIds.length) {
      const tables = await tx.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
        SELECT to_regclass('"PlayerPoolProfile"') IS NOT NULL AS "exists"
      `);
      if (tables[0]?.exists) {
        playerPoolProfilesUpdated = await tx.$executeRaw(Prisma.sql`
          UPDATE "PlayerPoolProfile"
          SET "emailNormalized" = ${newEmail}, "updatedAt" = NOW()
          WHERE "prospectId" IN (${Prisma.join(prospectIds)})
        `);
      }
    }

    let leadRecipientsUpdated = 0;
    if (leadIds.length) {
      const changed = await tx.notificationRecipient.updateMany({
        where: { sourceType: "LEAD", sourceId: { in: leadIds } },
        data: {
          displayName: separateName,
          email: newEmail,
          emailNormalized: newEmail,
          ...(newPhone ? { phone: newPhone, phoneNormalized: newPhone } : {}),
          lastSyncedAt: new Date(),
        },
      });
      leadRecipientsUpdated = changed.count;
    }

    let prospectRecipientsUpdated = 0;
    if (prospectIds.length) {
      const changed = await tx.notificationRecipient.updateMany({
        where: { sourceId: { in: prospectIds.map((id) => `team-prospect:${id}`) } },
        data: {
          displayName: separateName,
          email: newEmail,
          emailNormalized: newEmail,
          ...(newPhone ? { phone: newPhone, phoneNormalized: newPhone } : {}),
          lastSyncedAt: new Date(),
        },
      });
      prospectRecipientsUpdated = changed.count;
    }

    // Rebuild stale shared-email player notifications from the football source
    // record itself. Ownership is never inferred from the shared email address.
    const feeTruth = await tx.$queryRaw<PlayerRecipientTruthRow[]>(Prisma.sql`
      SELECT
        recipient."id" AS "recipientId",
        COALESCE(NULLIF(BTRIM(player_user."name"), ''), NULLIF(BTRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")), '')) AS "displayName",
        COALESCE(NULLIF(BTRIM(player_user."email"), ''), NULLIF(BTRIM(prospect."email"), '')) AS "email",
        COALESCE(NULLIF(BTRIM(profile."phone"), ''), NULLIF(BTRIM(prospect."phone"), '')) AS "phone"
      FROM "NotificationRecipient" recipient
      JOIN "PlayerMatchFee" fee ON recipient."sourceId" = 'player-match-fee:' || fee."id"
      LEFT JOIN "TeamMember" member ON member."id" = fee."teamMemberId"
      LEFT JOIN "User" player_user ON player_user."id" = member."userId"
      LEFT JOIN "TeamMemberProfile" profile ON profile."teamMemberId" = member."id"
      LEFT JOIN "TeamPlayerProspect" prospect ON prospect."id" = fee."prospectId"
      WHERE LOWER(COALESCE(NULLIF(BTRIM(recipient."emailNormalized"), ''), NULLIF(BTRIM(recipient."email"), ''))) = ${sharedEmail}
    `);

    const selectionTruth = await tx.$queryRaw<PlayerRecipientTruthRow[]>(Prisma.sql`
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

    const prospectTruth = await tx.$queryRaw<PlayerRecipientTruthRow[]>(Prisma.sql`
      SELECT
        recipient."id" AS "recipientId",
        NULLIF(BTRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")), '') AS "displayName",
        NULLIF(BTRIM(prospect."email"), '') AS "email",
        NULLIF(BTRIM(prospect."phone"), '') AS "phone"
      FROM "NotificationRecipient" recipient
      JOIN "TeamPlayerProspect" prospect ON recipient."sourceId" = 'team-prospect:' || prospect."id"
      WHERE LOWER(COALESCE(NULLIF(BTRIM(recipient."emailNormalized"), ''), NULLIF(BTRIM(recipient."email"), ''))) = ${sharedEmail}
    `);

    const authoritativeRows = [...feeTruth, ...selectionTruth, ...prospectTruth];
    let playerSourceRecipientsResynced = 0;
    for (const row of authoritativeRows) {
      if (!row.displayName && !row.email && !row.phone) continue;
      const authoritativeEmail = row.email?.trim().toLowerCase() || null;
      const authoritativePhone = row.phone ? normalizePhoneNumber(row.phone) : null;
      await tx.notificationRecipient.update({
        where: { id: row.recipientId },
        data: {
          displayName: row.displayName?.trim() || null,
          email: authoritativeEmail,
          emailNormalized: authoritativeEmail,
          phone: authoritativePhone,
          phoneNormalized: authoritativePhone,
          lastSyncedAt: new Date(),
        },
      });
      playerSourceRecipientsResynced += 1;
    }

    const unresolved = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS "count"
      FROM "NotificationRecipient"
      WHERE LOWER(COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), ''))) = ${sharedEmail}
        AND LOWER(REGEXP_REPLACE(BTRIM(COALESCE("displayName", '')), '[[:space:]]+', ' ', 'g')) = ${separateNameNormalised}
    `);
    const unresolvedRecipientsLeft = Number(unresolved[0]?.count ?? BigInt(0));

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
        ${randomUUID()}, ${sharedEmail}, ${separateName}, ${newEmail}, ${newPhone},
        ${input.actorUserId ?? null}, ${input.actorEmail ?? null},
        ${JSON.stringify(result)}::jsonb, NOW()
      )
    `);

    return result;
  });
}
