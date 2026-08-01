import { randomUUID } from "node:crypto";

import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { prisma } from "@/lib/prisma";

export type PlayerMergeTeam = {
  membershipId: string;
  teamId: string;
  teamName: string;
  role: string;
  leagueName: string | null;
  leagueSeason: string | null;
};

export type PlayerMergeAccountSummary = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  phone: string | null;
  teams: PlayerMergeTeam[];
  profileCount: number;
  availabilityCount: number;
  selectionCount: number;
  playerPaymentCount: number;
  loginAccountCount: number;
  activeSessionCount: number;
};

export type PlayerMergePreview = {
  selected: PlayerMergeAccountSummary;
  candidates: PlayerMergeAccountSummary[];
};

export type PlayerMergeResult = {
  keptUserId: string;
  mergedUserId: string;
  movedMemberships: number;
  consolidatedMemberships: number;
  teams: string[];
};

type RawTransaction = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  user: typeof prisma.user;
  teamMember: typeof prisma.teamMember;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

type MembershipRow = {
  membershipId: string;
  userId: string;
  teamId: string;
  teamName: string;
  role: string;
  leagueName: string | null;
  leagueSeason: string | null;
};

type PhoneRow = { phone: string | null };
type CountRow = {
  profileCount: bigint | number;
  availabilityCount: bigint | number;
  selectionCount: bigint | number;
  playerPaymentCount: bigint | number;
  loginAccountCount: bigint | number;
  activeSessionCount: bigint | number;
};

type ProfileRow = {
  id: string;
  sourceProspectId: string | null;
  phone: string | null;
  ageBand: string | null;
  preferredPositions: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: unknown | null;
  availabilitySummary: string | null;
  notes: string | null;
  playerMatchFeePenceOverride: number | null;
};

type PaymentConflictRow = {
  fixtureId: string;
  duplicateFeeId: string;
  keptFeeId: string;
};

type OverrideRow = {
  teamMemberId: string;
  amountPence: number | null;
};

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function asNumber(value: bigint | number | null | undefined) {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

async function loadAccountSummary(userId: string): Promise<PlayerMergeAccountSummary | null> {
  const userRows = await prisma.$queryRawUnsafe<UserRow[]>(
    `SELECT "id", "name", "email", "role"::text AS "role"
     FROM "User"
     WHERE "id" = $1
     LIMIT 1`,
    userId,
  );
  const user = userRows[0];
  if (!user) return null;

  const [membershipRows, phoneRows, countRows] = await Promise.all([
    prisma.$queryRawUnsafe<MembershipRow[]>(
      `SELECT
         member."id" AS "membershipId",
         member."userId",
         member."teamId",
         team."name" AS "teamName",
         member."role"::text AS "role",
         league."name" AS "leagueName",
         league."season" AS "leagueSeason"
       FROM "TeamMember" member
       INNER JOIN "Team" team ON team."id" = member."teamId"
       LEFT JOIN "League" league ON league."id" = team."leagueId"
       WHERE member."userId" = $1
       ORDER BY team."name" ASC, member."createdAt" ASC`,
      userId,
    ),
    prisma.$queryRawUnsafe<PhoneRow[]>(
      `SELECT profile."phone"
       FROM "TeamMemberProfile" profile
       INNER JOIN "TeamMember" member ON member."id" = profile."teamMemberId"
       WHERE member."userId" = $1
         AND NULLIF(BTRIM(profile."phone"), '') IS NOT NULL
       ORDER BY profile."updatedAt" DESC
       LIMIT 1`,
      userId,
    ),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT
         (SELECT COUNT(*) FROM "TeamMemberProfile" profile
          INNER JOIN "TeamMember" member ON member."id" = profile."teamMemberId"
          WHERE member."userId" = $1) AS "profileCount",
         (SELECT COUNT(*) FROM "FixtureAvailability" availability
          INNER JOIN "TeamMember" member ON member."id" = availability."teamMemberId"
          WHERE member."userId" = $1) AS "availabilityCount",
         (SELECT COUNT(*) FROM "FixtureSelection" selection
          INNER JOIN "TeamMember" member ON member."id" = selection."teamMemberId"
          WHERE member."userId" = $1) AS "selectionCount",
         (SELECT COUNT(*) FROM "PlayerMatchFee" fee
          INNER JOIN "TeamMember" member ON member."id" = fee."teamMemberId"
          WHERE member."userId" = $1) AS "playerPaymentCount",
         (SELECT COUNT(*) FROM "Account" account WHERE account."userId" = $1) AS "loginAccountCount",
         (SELECT COUNT(*) FROM "Session" session WHERE session."userId" = $1 AND session."expires" > NOW()) AS "activeSessionCount"`,
      userId,
    ),
  ]);

  const counts = countRows[0];
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: phoneRows[0]?.phone ?? null,
    teams: membershipRows.map((row) => ({
      membershipId: row.membershipId,
      teamId: row.teamId,
      teamName: row.teamName,
      role: row.role,
      leagueName: row.leagueName,
      leagueSeason: row.leagueSeason,
    })),
    profileCount: asNumber(counts?.profileCount),
    availabilityCount: asNumber(counts?.availabilityCount),
    selectionCount: asNumber(counts?.selectionCount),
    playerPaymentCount: asNumber(counts?.playerPaymentCount),
    loginAccountCount: asNumber(counts?.loginAccountCount),
    activeSessionCount: asNumber(counts?.activeSessionCount),
  };
}

export async function getPlayerMergePreview(
  selectedUserId: string,
): Promise<PlayerMergePreview | null> {
  const selected = await loadAccountSummary(selectedUserId);
  if (!selected) return null;

  const normalizedName = normalizeName(selected.name);
  const normalizedEmail = normalizeEmail(selected.email);
  const normalizedPhone = normalizePhoneNumber(selected.phone)?.replace(/^\+/, "") ?? null;

  const candidateRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT DISTINCT candidate."id"
     FROM "User" candidate
     WHERE candidate."id" <> $1
       AND candidate."role" <> 'ADMIN'
       AND (
         ($2 <> '' AND LOWER(REGEXP_REPLACE(BTRIM(COALESCE(candidate."name", '')), '[[:space:]]+', ' ', 'g')) = $2)
         OR ($3::text IS NOT NULL AND LOWER(BTRIM(COALESCE(candidate."email", ''))) = $3)
         OR ($4::text IS NOT NULL AND EXISTS (
           SELECT 1
           FROM "TeamMember" candidate_member
           INNER JOIN "TeamMemberProfile" candidate_profile
             ON candidate_profile."teamMemberId" = candidate_member."id"
           WHERE candidate_member."userId" = candidate."id"
             AND CASE
               WHEN REGEXP_REPLACE(COALESCE(candidate_profile."phone", ''), '[^0-9]', '', 'g') LIKE '0%'
                 THEN '44' || SUBSTRING(REGEXP_REPLACE(COALESCE(candidate_profile."phone", ''), '[^0-9]', '', 'g') FROM 2)
               WHEN REGEXP_REPLACE(COALESCE(candidate_profile."phone", ''), '[^0-9]', '', 'g') LIKE '44%'
                 THEN REGEXP_REPLACE(COALESCE(candidate_profile."phone", ''), '[^0-9]', '', 'g')
               ELSE '44' || REGEXP_REPLACE(COALESCE(candidate_profile."phone", ''), '[^0-9]', '', 'g')
             END = $4
         ))
       )
     ORDER BY candidate."id"
     LIMIT 30`,
    selectedUserId,
    normalizedName,
    normalizedEmail,
    normalizedPhone,
  );

  const candidates = (
    await Promise.all(candidateRows.map((row) => loadAccountSummary(row.id)))
  ).filter((value): value is PlayerMergeAccountSummary => Boolean(value));

  return { selected, candidates };
}

export class PlayerMergeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerMergeConflictError";
  }
}

async function getProfile(
  tx: RawTransaction,
  teamMemberId: string,
): Promise<ProfileRow | null> {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT
       "id",
       "sourceProspectId",
       "phone",
       "ageBand",
       "preferredPositions",
       "experienceSummary",
       "availabilityLevel",
       "preferredNights",
       "availabilitySummary",
       "notes",
       "playerMatchFeePenceOverride"
     FROM "TeamMemberProfile"
     WHERE "teamMemberId" = $1
     LIMIT 1`,
    teamMemberId,
  )) as ProfileRow[];
  return rows[0] ?? null;
}

async function mergeProfiles(
  tx: RawTransaction,
  keptMembershipId: string,
  duplicateMembershipId: string,
) {
  const [keptProfile, duplicateProfile] = await Promise.all([
    getProfile(tx, keptMembershipId),
    getProfile(tx, duplicateMembershipId),
  ]);

  if (!duplicateProfile) return;

  if (!keptProfile) {
    await tx.$executeRawUnsafe(
      `UPDATE "TeamMemberProfile"
       SET "teamMemberId" = $1, "updatedAt" = NOW()
       WHERE "teamMemberId" = $2`,
      keptMembershipId,
      duplicateMembershipId,
    );
    return;
  }

  await tx.$executeRawUnsafe(
    `DELETE FROM "TeamMemberProfile" WHERE "teamMemberId" = $1`,
    duplicateMembershipId,
  );

  await tx.$executeRawUnsafe(
    `UPDATE "TeamMemberProfile"
     SET
       "sourceProspectId" = COALESCE("sourceProspectId", $1),
       "phone" = COALESCE(NULLIF(BTRIM("phone"), ''), $2),
       "ageBand" = COALESCE(NULLIF(BTRIM("ageBand"), ''), $3),
       "preferredPositions" = COALESCE(NULLIF(BTRIM("preferredPositions"), ''), $4),
       "experienceSummary" = COALESCE(NULLIF(BTRIM("experienceSummary"), ''), $5),
       "availabilityLevel" = COALESCE(NULLIF(BTRIM("availabilityLevel"), ''), $6),
       "preferredNights" = COALESCE("preferredNights", $7::jsonb),
       "availabilitySummary" = COALESCE(NULLIF(BTRIM("availabilitySummary"), ''), $8),
       "notes" = COALESCE(NULLIF(BTRIM("notes"), ''), $9),
       "playerMatchFeePenceOverride" = COALESCE("playerMatchFeePenceOverride", $10),
       "updatedAt" = NOW()
     WHERE "teamMemberId" = $11`,
    duplicateProfile.sourceProspectId,
    duplicateProfile.phone,
    duplicateProfile.ageBand,
    duplicateProfile.preferredPositions,
    duplicateProfile.experienceSummary,
    duplicateProfile.availabilityLevel,
    duplicateProfile.preferredNights === null
      ? null
      : JSON.stringify(duplicateProfile.preferredNights),
    duplicateProfile.availabilitySummary,
    duplicateProfile.notes,
    duplicateProfile.playerMatchFeePenceOverride,
    keptMembershipId,
  );
}

async function mergeMembershipRecords(
  tx: RawTransaction,
  keptMembershipId: string,
  duplicateMembershipId: string,
) {
  const paymentConflicts = (await tx.$queryRawUnsafe(
    `SELECT
       duplicate_fee."fixtureId",
       duplicate_fee."id" AS "duplicateFeeId",
       kept_fee."id" AS "keptFeeId"
     FROM "PlayerMatchFee" duplicate_fee
     INNER JOIN "PlayerMatchFee" kept_fee
       ON kept_fee."fixtureId" = duplicate_fee."fixtureId"
      AND kept_fee."teamId" = duplicate_fee."teamId"
     WHERE duplicate_fee."teamMemberId" = $1
       AND kept_fee."teamMemberId" = $2
       AND duplicate_fee."status" <> 'CANCELLED'
       AND kept_fee."status" <> 'CANCELLED'
     LIMIT 1`,
    duplicateMembershipId,
    keptMembershipId,
  )) as PaymentConflictRow[];

  if (paymentConflicts[0]) {
    throw new PlayerMergeConflictError(
      "Both player records have active payment rows for the same fixture. Resolve that fixture payment first; the merge has not changed anything.",
    );
  }

  const overrideRows = (await tx.$queryRawUnsafe(
    `SELECT "teamMemberId", "playerMatchFeePenceOverride" AS "amountPence"
     FROM "TeamMemberProfile"
     WHERE "teamMemberId" IN ($1, $2)`,
    duplicateMembershipId,
    keptMembershipId,
  )) as OverrideRow[];
  const duplicateOverride = overrideRows.find(
    (row) => row.teamMemberId === duplicateMembershipId,
  )?.amountPence;
  const keptOverride = overrideRows.find(
    (row) => row.teamMemberId === keptMembershipId,
  )?.amountPence;

  if (
    duplicateOverride !== null &&
    typeof duplicateOverride !== "undefined" &&
    keptOverride !== null &&
    typeof keptOverride !== "undefined" &&
    duplicateOverride !== keptOverride
  ) {
    throw new PlayerMergeConflictError(
      "The two records have different admin fee overrides. Clear or align those overrides before merging.",
    );
  }

  await mergeProfiles(tx, keptMembershipId, duplicateMembershipId);

  await tx.$executeRawUnsafe(
    `UPDATE "FixtureAvailability" kept
     SET
       "response" = CASE
         WHEN COALESCE(duplicate."respondedAt", duplicate."updatedAt") > COALESCE(kept."respondedAt", kept."updatedAt")
           THEN duplicate."response"
         ELSE kept."response"
       END,
       "note" = COALESCE(kept."note", duplicate."note"),
       "respondedAt" = GREATEST(kept."respondedAt", duplicate."respondedAt"),
       "updatedAt" = NOW()
     FROM "FixtureAvailability" duplicate
     WHERE kept."teamMemberId" = $1
       AND duplicate."teamMemberId" = $2
       AND kept."fixtureId" = duplicate."fixtureId"`,
    keptMembershipId,
    duplicateMembershipId,
  );
  await tx.$executeRawUnsafe(
    `DELETE FROM "FixtureAvailability" duplicate
     USING "FixtureAvailability" kept
     WHERE duplicate."teamMemberId" = $1
       AND kept."teamMemberId" = $2
       AND duplicate."fixtureId" = kept."fixtureId"`,
    duplicateMembershipId,
    keptMembershipId,
  );
  await tx.$executeRawUnsafe(
    `UPDATE "FixtureAvailability" SET "teamMemberId" = $1, "updatedAt" = NOW()
     WHERE "teamMemberId" = $2`,
    keptMembershipId,
    duplicateMembershipId,
  );

  await tx.$executeRawUnsafe(
    `UPDATE "FixtureSelection" kept
     SET
       "selectionStatus" = CASE
         WHEN kept."selectionStatus" = 'NOT_SELECTED' AND duplicate."selectionStatus" <> 'NOT_SELECTED'
           THEN duplicate."selectionStatus"
         ELSE kept."selectionStatus"
       END,
       "isCaptain" = kept."isCaptain" OR duplicate."isCaptain",
       "isGoalkeeper" = kept."isGoalkeeper" OR duplicate."isGoalkeeper",
       "note" = COALESCE(kept."note", duplicate."note"),
       "updatedAt" = NOW()
     FROM "FixtureSelection" duplicate
     WHERE kept."teamMemberId" = $1
       AND duplicate."teamMemberId" = $2
       AND kept."fixtureId" = duplicate."fixtureId"`,
    keptMembershipId,
    duplicateMembershipId,
  );
  await tx.$executeRawUnsafe(
    `DELETE FROM "FixtureSelection" duplicate
     USING "FixtureSelection" kept
     WHERE duplicate."teamMemberId" = $1
       AND kept."teamMemberId" = $2
       AND duplicate."fixtureId" = kept."fixtureId"`,
    duplicateMembershipId,
    keptMembershipId,
  );
  await tx.$executeRawUnsafe(
    `UPDATE "FixtureSelection" SET "teamMemberId" = $1, "updatedAt" = NOW()
     WHERE "teamMemberId" = $2`,
    keptMembershipId,
    duplicateMembershipId,
  );

  await tx.$executeRawUnsafe(
    `DELETE FROM "PlayerMatchFee" duplicate_fee
     USING "PlayerMatchFee" kept_fee
     WHERE duplicate_fee."teamMemberId" = $1
       AND kept_fee."teamMemberId" = $2
       AND duplicate_fee."fixtureId" = kept_fee."fixtureId"
       AND duplicate_fee."teamId" = kept_fee."teamId"
       AND duplicate_fee."status" = 'CANCELLED'`,
    duplicateMembershipId,
    keptMembershipId,
  );
  await tx.$executeRawUnsafe(
    `DELETE FROM "PlayerMatchFee" kept_fee
     USING "PlayerMatchFee" duplicate_fee
     WHERE kept_fee."teamMemberId" = $1
       AND duplicate_fee."teamMemberId" = $2
       AND kept_fee."fixtureId" = duplicate_fee."fixtureId"
       AND kept_fee."teamId" = duplicate_fee."teamId"
       AND kept_fee."status" = 'CANCELLED'
       AND duplicate_fee."status" <> 'CANCELLED'`,
    keptMembershipId,
    duplicateMembershipId,
  );
  await tx.$executeRawUnsafe(
    `UPDATE "PlayerMatchFee" SET "teamMemberId" = $1, "updatedAt" = NOW()
     WHERE "teamMemberId" = $2`,
    keptMembershipId,
    duplicateMembershipId,
  );

  await tx.$executeRawUnsafe(
    `UPDATE "TeamMemberFeeOverrideAudit" SET "teamMemberId" = $1
     WHERE "teamMemberId" = $2`,
    keptMembershipId,
    duplicateMembershipId,
  ).catch(() => 0);

  await tx.$executeRawUnsafe(
    `UPDATE "MatchResultTeamMeta"
     SET "scorers" = REPLACE("scorers"::text, $1, $2)::jsonb,
         "updatedAt" = NOW()
     WHERE "scorers" IS NOT NULL
       AND "scorers"::text LIKE '%' || $1 || '%'`,
    duplicateMembershipId,
    keptMembershipId,
  );

  await tx.teamMember.delete({ where: { id: duplicateMembershipId } });
}

export async function mergePlayerAccounts(input: {
  keptUserId: string;
  mergedUserId: string;
  mergedByUserId: string | null;
  mergedByEmail: string | null;
}): Promise<PlayerMergeResult> {
  if (!input.keptUserId || !input.mergedUserId) {
    throw new PlayerMergeConflictError("Choose both player accounts.");
  }
  if (input.keptUserId === input.mergedUserId) {
    throw new PlayerMergeConflictError("The account to keep and the account to merge must be different.");
  }

  return prisma.$transaction(async (rawTx) => {
    const tx = rawTx as unknown as RawTransaction;
    const lockIds = [input.keptUserId, input.mergedUserId].sort();
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2))",
      `player-merge:${lockIds[0]}`,
      `player-merge:${lockIds[1]}`,
    );

    const [keptUser, mergedUser] = await Promise.all([
      tx.user.findUnique({
        where: { id: input.keptUserId },
        select: { id: true, name: true, email: true, role: true },
      }),
      tx.user.findUnique({
        where: { id: input.mergedUserId },
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);

    if (!keptUser || !mergedUser) {
      throw new PlayerMergeConflictError("One of the player accounts no longer exists.");
    }
    if (keptUser.role === "ADMIN" || mergedUser.role === "ADMIN") {
      throw new PlayerMergeConflictError("Administrator accounts cannot be merged as player duplicates.");
    }

    const [keptMemberships, mergedMemberships] = await Promise.all([
      tx.teamMember.findMany({
        where: { userId: keptUser.id },
        select: { id: true, teamId: true, team: { select: { name: true } } },
      }),
      tx.teamMember.findMany({
        where: { userId: mergedUser.id },
        select: { id: true, teamId: true, team: { select: { name: true } } },
      }),
    ]);

    if (mergedMemberships.length === 0) {
      throw new PlayerMergeConflictError("The duplicate account is not attached to any squad.");
    }

    const keptByTeamId = new Map(
      keptMemberships.map((membership) => [membership.teamId, membership]),
    );
    let movedMemberships = 0;
    let consolidatedMemberships = 0;
    const affectedTeams = new Set<string>();

    for (const duplicateMembership of mergedMemberships) {
      affectedTeams.add(duplicateMembership.team.name);
      const keptMembership = keptByTeamId.get(duplicateMembership.teamId);

      if (!keptMembership) {
        await tx.teamMember.update({
          where: { id: duplicateMembership.id },
          data: { userId: keptUser.id },
        });
        movedMemberships += 1;
        continue;
      }

      await mergeMembershipRecords(
        tx,
        keptMembership.id,
        duplicateMembership.id,
      );
      consolidatedMemberships += 1;
    }

    const mergedEmail = mergedUser.email;
    const keptEmail = keptUser.email ?? mergedEmail;
    const keptName = keptUser.name?.trim() || mergedUser.name?.trim() || "Player";

    await tx.user.update({
      where: { id: mergedUser.id },
      data: {
        email: null,
        image: null,
        name: `[Merged] ${mergedUser.name || mergedEmail || mergedUser.id} → ${keptName}`,
        role: "USER",
      },
    });

    const whatsappRows = (await tx.$queryRawUnsafe(
      `SELECT "id", COALESCE("usesWhatsapp", false) AS "usesWhatsapp"
       FROM "User"
       WHERE "id" IN ($1, $2)`,
      keptUser.id,
      mergedUser.id,
    )) as Array<{ id: string; usesWhatsapp: boolean }>;
    const usesWhatsapp = whatsappRows.some((row) => Boolean(row.usesWhatsapp));

    await tx.user.update({
      where: { id: keptUser.id },
      data: {
        name: keptName,
        email: keptEmail,
      },
    });
    await tx.$executeRawUnsafe(
      `UPDATE "User" SET "usesWhatsapp" = $1 WHERE "id" = $2`,
      usesWhatsapp,
      keptUser.id,
    );

    const keptAccountRows = (await tx.$queryRawUnsafe(
      `SELECT COUNT(*) AS "count" FROM "Account" WHERE "userId" = $1`,
      keptUser.id,
    )) as Array<{ count: bigint | number }>;
    if (asNumber(keptAccountRows[0]?.count) === 0) {
      await tx.$executeRawUnsafe(
        `UPDATE "Account" SET "userId" = $1 WHERE "userId" = $2`,
        keptUser.id,
        mergedUser.id,
      );
    } else {
      await tx.$executeRawUnsafe(
        `DELETE FROM "Account" WHERE "userId" = $1`,
        mergedUser.id,
      );
    }
    await tx.$executeRawUnsafe(
      `DELETE FROM "Session" WHERE "userId" = $1`,
      mergedUser.id,
    );

    const canonicalRecipientRows = (await tx.$queryRawUnsafe(
      `SELECT "id" FROM "NotificationRecipient"
       WHERE "sourceType" = 'USER' AND "sourceId" = $1
       LIMIT 1`,
      keptUser.id,
    )) as Array<{ id: string }>;
    if (canonicalRecipientRows[0]) {
      await tx.$executeRawUnsafe(
        `DELETE FROM "NotificationRecipient"
         WHERE "sourceType" = 'USER' AND "sourceId" = $1`,
        mergedUser.id,
      );
    } else {
      await tx.$executeRawUnsafe(
        `UPDATE "NotificationRecipient"
         SET "sourceId" = $1, "email" = COALESCE("email", $2), "emailNormalized" = COALESCE("emailNormalized", $2)
         WHERE "sourceType" = 'USER' AND "sourceId" = $3`,
        keptUser.id,
        keptEmail,
        mergedUser.id,
      );
    }

    await tx.$executeRawUnsafe(
      `UPDATE "Team" SET "captainUserId" = $1 WHERE "captainUserId" = $2`,
      keptUser.id,
      mergedUser.id,
    );
    await tx.$executeRawUnsafe(
      `UPDATE "TeamMemberFeeOverrideAudit" SET "changedByUserId" = $1 WHERE "changedByUserId" = $2`,
      keptUser.id,
      mergedUser.id,
    ).catch(() => 0);
    await tx.$executeRawUnsafe(
      `UPDATE "PlayerDuplicateAttempt" SET "attemptedByUserId" = $1 WHERE "attemptedByUserId" = $2`,
      keptUser.id,
      mergedUser.id,
    ).catch(() => 0);

    const summary = {
      movedMemberships,
      consolidatedMemberships,
      teams: Array.from(affectedTeams).sort(),
      mergedByEmail: input.mergedByEmail,
    };
    await tx.$executeRawUnsafe(
      `INSERT INTO "PlayerAccountMerge" (
         "id", "keptUserId", "mergedUserId", "mergedByUserId",
         "keptEmail", "mergedEmail", "summary", "createdAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())`,
      randomUUID(),
      keptUser.id,
      mergedUser.id,
      input.mergedByUserId,
      keptEmail,
      mergedEmail,
      JSON.stringify(summary),
    );

    return {
      keptUserId: keptUser.id,
      mergedUserId: mergedUser.id,
      movedMemberships,
      consolidatedMemberships,
      teams: summary.teams,
    };
  });
}
