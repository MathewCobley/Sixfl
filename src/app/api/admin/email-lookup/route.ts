import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type QueryType = "email" | "phone" | "name";

type LookupMatch = {
  source: string;
  title: string;
  detail: string;
  effect: string;
  href: string | null;
  recordId: string | null;
  tone: "default" | "amber" | "emerald" | "sky";
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
  userName: string | null;
  userEmail: string | null;
  memberRole: string;
  teamId: string;
  teamName: string;
  phone: string | null;
};

type ProspectRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  teamId: string | null;
  teamName: string | null;
};

type LeadRow = {
  id: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  interestType: string;
  status: string;
  leagueName: string | null;
};

type TeamContactRow = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  secondaryContactName: string | null;
  secondaryContactEmail: string | null;
  secondaryContactPhone: string | null;
  captainInviteSentTo: string | null;
};

type NotificationRecipientRow = {
  id: string;
  sourceType: string;
  sourceId: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
};

type PlayerPoolRow = {
  id: string;
  prospectId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  leagueName: string | null;
};

type DuplicateAttemptRow = {
  id: string;
  teamId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  matchType: string;
  matchedRecordId: string | null;
  matchedTeamId: string | null;
  reason: string;
  createdAt: Date;
};

function normaliseEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  return email;
}

function normaliseName(value: string | null | undefined) {
  const name = value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  return name.length >= 2 ? name : null;
}

function normalisePhoneDigits(value: string | null | undefined) {
  const phone = normalizePhoneNumber(value);
  return phone?.replace(/^\+/, "") ?? null;
}

function sameEmail(value: string | null | undefined, email: string) {
  return normaliseEmail(value) === email;
}

function sameName(value: string | null | undefined, name: string) {
  return normaliseName(value) === name;
}

function samePhone(value: string | null | undefined, phoneDigits: string) {
  return normalisePhoneDigits(value) === phoneDigits;
}

function fullName(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function formatAttemptDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(value);
}

function identityStrengthCopy(queryType: QueryType) {
  if (queryType === "name") {
    return "This is an exact name match only. Check the email or mobile number before deciding it is the same person.";
  }
  return "This is a contact-identity match and is strong evidence that this is the existing player record.";
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const rawQuery = (url.searchParams.get("q") ?? url.searchParams.get("email") ?? "").trim();
  if (!rawQuery) {
    return NextResponse.json(
      { ok: false, error: "Enter an email address, mobile number or full player name." },
      { status: 400 },
    );
  }

  const email = normaliseEmail(rawQuery);
  const phoneDigits = email ? null : normalisePhoneDigits(rawQuery);
  const name = email || phoneDigits ? null : normaliseName(rawQuery);
  const queryType: QueryType = email ? "email" : phoneDigits ? "phone" : "name";

  if (!email && !phoneDigits && !name) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address, mobile number or full player name." },
      { status: 400 },
    );
  }

  const optionalTables = await prisma.$queryRaw<
    Array<{ playerPool: boolean; duplicateAttempts: boolean; teamMemberProfile: boolean }>
  >(Prisma.sql`
    SELECT
      to_regclass('"PlayerPoolProfile"') IS NOT NULL AS "playerPool",
      to_regclass('"PlayerDuplicateAttempt"') IS NOT NULL AS "duplicateAttempts",
      to_regclass('"TeamMemberProfile"') IS NOT NULL AS "teamMemberProfile"
  `);

  const tableState = optionalTables[0] ?? {
    playerPool: false,
    duplicateAttempts: false,
    teamMemberProfile: false,
  };

  let users: UserRow[] = [];
  let memberships: MembershipRow[] = [];
  let prospects: ProspectRow[] = [];
  let leads: LeadRow[] = [];
  let teams: TeamContactRow[] = [];
  let notificationRecipients: NotificationRecipientRow[] = [];
  let playerPoolRows: PlayerPoolRow[] = [];
  let duplicateAttempts: DuplicateAttemptRow[] = [];

  if (queryType === "email" && email) {
    [users, memberships, prospects, leads, teams, notificationRecipients] = await Promise.all([
      prisma.$queryRaw<UserRow[]>(Prisma.sql`
        SELECT "id", "name", "email", "role"::text AS "role"
        FROM "User"
        WHERE LOWER(BTRIM(COALESCE("email", ''))) = ${email}
        ORDER BY "name" NULLS LAST, "id"
      `),
      prisma.$queryRaw<MembershipRow[]>(Prisma.sql`
        SELECT
          member."id" AS "membershipId",
          player_user."id" AS "userId",
          player_user."name" AS "userName",
          player_user."email" AS "userEmail",
          member."role"::text AS "memberRole",
          team."id" AS "teamId",
          team."name" AS "teamName",
          profile."phone" AS "phone"
        FROM "TeamMember" member
        JOIN "User" player_user ON player_user."id" = member."userId"
        JOIN "Team" team ON team."id" = member."teamId"
        LEFT JOIN "TeamMemberProfile" profile ON profile."teamMemberId" = member."id"
        WHERE LOWER(BTRIM(COALESCE(player_user."email", ''))) = ${email}
        ORDER BY team."name", member."id"
      `),
      prisma.$queryRaw<ProspectRow[]>(Prisma.sql`
        SELECT
          prospect."id",
          prospect."firstName",
          prospect."lastName",
          prospect."email",
          prospect."phone",
          prospect."status",
          team."id" AS "teamId",
          team."name" AS "teamName"
        FROM "TeamPlayerProspect" prospect
        LEFT JOIN "Team" team ON team."id" = prospect."teamId"
        WHERE LOWER(BTRIM(COALESCE(prospect."email", ''))) = ${email}
        ORDER BY prospect."updatedAt" DESC
      `),
      prisma.$queryRaw<LeadRow[]>(Prisma.sql`
        SELECT
          lead."id",
          lead."contactName",
          lead."email",
          lead."phone",
          lead."interestType"::text AS "interestType",
          lead."status"::text AS "status",
          league."name" AS "leagueName"
        FROM "InterestLead" lead
        LEFT JOIN "League" league ON league."id" = lead."leagueId"
        WHERE LOWER(BTRIM(COALESCE(lead."email", ''))) = ${email}
        ORDER BY lead."createdAt" DESC
      `),
      prisma.$queryRaw<TeamContactRow[]>(Prisma.sql`
        SELECT
          "id", "name", "contactName", "contactEmail", "contactPhone",
          "secondaryContactName", "secondaryContactEmail", "secondaryContactPhone",
          "captainInviteSentTo"
        FROM "Team"
        WHERE LOWER(BTRIM(COALESCE("contactEmail", ''))) = ${email}
           OR LOWER(BTRIM(COALESCE("secondaryContactEmail", ''))) = ${email}
           OR LOWER(BTRIM(COALESCE("captainInviteSentTo", ''))) = ${email}
        ORDER BY "name"
      `),
      prisma.$queryRaw<NotificationRecipientRow[]>(Prisma.sql`
        SELECT
          "id",
          "sourceType"::text AS "sourceType",
          "sourceId",
          "displayName",
          COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), '')) AS "email",
          COALESCE(NULLIF(BTRIM("phoneNormalized"), ''), NULLIF(BTRIM("phone"), '')) AS "phone"
        FROM "NotificationRecipient"
        WHERE LOWER(COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), ''))) = ${email}
        ORDER BY "updatedAt" DESC
        LIMIT 20
      `),
    ]);

    playerPoolRows = tableState.playerPool
      ? await prisma.$queryRaw<PlayerPoolRow[]>(Prisma.sql`
          SELECT
            profile."id",
            prospect."id" AS "prospectId",
            prospect."firstName",
            prospect."lastName",
            prospect."email",
            prospect."phone",
            profile."status"::text AS "status",
            league."name" AS "leagueName"
          FROM "PlayerPoolProfile" profile
          JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
          LEFT JOIN "League" league ON league."id" = profile."leagueId"
          WHERE LOWER(BTRIM(COALESCE(profile."emailNormalized", prospect."email", ''))) = ${email}
             OR LOWER(BTRIM(COALESCE(prospect."email", ''))) = ${email}
          ORDER BY profile."updatedAt" DESC
          LIMIT 20
        `)
      : [];

    duplicateAttempts = tableState.duplicateAttempts
      ? await prisma.$queryRaw<DuplicateAttemptRow[]>(Prisma.sql`
          SELECT
            "id", "teamId", "displayName", "email", "phone", "matchType",
            "matchedRecordId", "matchedTeamId", "reason", "createdAt"
          FROM "PlayerDuplicateAttempt"
          WHERE LOWER(BTRIM(COALESCE("email", ''))) = ${email}
          ORDER BY "createdAt" DESC
          LIMIT 20
        `)
      : [];
  }

  if (queryType === "phone" && phoneDigits) {
    [prospects, leads, teams, notificationRecipients] = await Promise.all([
      prisma.$queryRaw<ProspectRow[]>(Prisma.sql`
        SELECT
          prospect."id",
          prospect."firstName",
          prospect."lastName",
          prospect."email",
          prospect."phone",
          prospect."status",
          team."id" AS "teamId",
          team."name" AS "teamName"
        FROM "TeamPlayerProspect" prospect
        LEFT JOIN "Team" team ON team."id" = prospect."teamId"
        WHERE CASE
          WHEN REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g') LIKE '0%'
            THEN '44' || SUBSTRING(REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g') FROM 2)
          WHEN REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g') LIKE '44%'
            THEN REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g')
          ELSE '44' || REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g')
        END = ${phoneDigits}
        ORDER BY prospect."updatedAt" DESC
      `),
      prisma.$queryRaw<LeadRow[]>(Prisma.sql`
        SELECT
          lead."id",
          lead."contactName",
          lead."email",
          lead."phone",
          lead."interestType"::text AS "interestType",
          lead."status"::text AS "status",
          league."name" AS "leagueName"
        FROM "InterestLead" lead
        LEFT JOIN "League" league ON league."id" = lead."leagueId"
        WHERE REGEXP_REPLACE(
          COALESCE(NULLIF(BTRIM(lead."phoneNormalized"), ''), NULLIF(BTRIM(lead."phone"), '')),
          '[^0-9]', '', 'g'
        ) = ${phoneDigits}
        ORDER BY lead."createdAt" DESC
      `),
      prisma.$queryRaw<TeamContactRow[]>(Prisma.sql`
        SELECT
          "id", "name", "contactName", "contactEmail", "contactPhone",
          "secondaryContactName", "secondaryContactEmail", "secondaryContactPhone",
          "captainInviteSentTo"
        FROM "Team"
        WHERE CASE
          WHEN REGEXP_REPLACE(COALESCE("contactPhone", ''), '[^0-9]', '', 'g') LIKE '0%'
            THEN '44' || SUBSTRING(REGEXP_REPLACE(COALESCE("contactPhone", ''), '[^0-9]', '', 'g') FROM 2)
          WHEN REGEXP_REPLACE(COALESCE("contactPhone", ''), '[^0-9]', '', 'g') LIKE '44%'
            THEN REGEXP_REPLACE(COALESCE("contactPhone", ''), '[^0-9]', '', 'g')
          ELSE '44' || REGEXP_REPLACE(COALESCE("contactPhone", ''), '[^0-9]', '', 'g')
        END = ${phoneDigits}
        OR CASE
          WHEN REGEXP_REPLACE(COALESCE("secondaryContactPhone", ''), '[^0-9]', '', 'g') LIKE '0%'
            THEN '44' || SUBSTRING(REGEXP_REPLACE(COALESCE("secondaryContactPhone", ''), '[^0-9]', '', 'g') FROM 2)
          WHEN REGEXP_REPLACE(COALESCE("secondaryContactPhone", ''), '[^0-9]', '', 'g') LIKE '44%'
            THEN REGEXP_REPLACE(COALESCE("secondaryContactPhone", ''), '[^0-9]', '', 'g')
          ELSE '44' || REGEXP_REPLACE(COALESCE("secondaryContactPhone", ''), '[^0-9]', '', 'g')
        END = ${phoneDigits}
        ORDER BY "name"
      `),
      prisma.$queryRaw<NotificationRecipientRow[]>(Prisma.sql`
        SELECT
          "id",
          "sourceType"::text AS "sourceType",
          "sourceId",
          "displayName",
          COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), '')) AS "email",
          COALESCE(NULLIF(BTRIM("phoneNormalized"), ''), NULLIF(BTRIM("phone"), '')) AS "phone"
        FROM "NotificationRecipient"
        WHERE REGEXP_REPLACE(
          COALESCE(NULLIF(BTRIM("phoneNormalized"), ''), NULLIF(BTRIM("phone"), '')),
          '[^0-9]', '', 'g'
        ) = ${phoneDigits}
        ORDER BY "updatedAt" DESC
        LIMIT 20
      `),
    ]);

    memberships = tableState.teamMemberProfile
      ? await prisma.$queryRaw<MembershipRow[]>(Prisma.sql`
          WITH profile_phones AS (
            SELECT
              profile."teamMemberId",
              profile."phone",
              CASE
                WHEN REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g') LIKE '0%'
                  THEN '44' || SUBSTRING(REGEXP_REPLACE(COALESCE(profile."phone", ''), '[^0-9]', '', 'g') FROM 2)
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
            member."role"::text AS "memberRole",
            team."id" AS "teamId",
            team."name" AS "teamName",
            profile_phones."phone" AS "phone"
          FROM profile_phones
          JOIN "TeamMember" member ON member."id" = profile_phones."teamMemberId"
          JOIN "User" player_user ON player_user."id" = member."userId"
          JOIN "Team" team ON team."id" = member."teamId"
          WHERE profile_phones."phoneNormalized" = ${phoneDigits}
          ORDER BY team."name", member."id"
        `)
      : [];

    users = memberships.length
      ? await prisma.$queryRaw<UserRow[]>(Prisma.sql`
          SELECT DISTINCT player_user."id", player_user."name", player_user."email", player_user."role"::text AS "role"
          FROM "User" player_user
          WHERE player_user."id" IN (${Prisma.join(memberships.map((row) => row.userId))})
          ORDER BY player_user."name" NULLS LAST, player_user."id"
        `)
      : [];

    playerPoolRows = tableState.playerPool
      ? await prisma.$queryRaw<PlayerPoolRow[]>(Prisma.sql`
          SELECT
            profile."id",
            prospect."id" AS "prospectId",
            prospect."firstName",
            prospect."lastName",
            prospect."email",
            prospect."phone",
            profile."status"::text AS "status",
            league."name" AS "leagueName"
          FROM "PlayerPoolProfile" profile
          JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
          LEFT JOIN "League" league ON league."id" = profile."leagueId"
          WHERE CASE
            WHEN REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g') LIKE '0%'
              THEN '44' || SUBSTRING(REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g') FROM 2)
            WHEN REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g') LIKE '44%'
              THEN REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g')
            ELSE '44' || REGEXP_REPLACE(COALESCE(prospect."phone", ''), '[^0-9]', '', 'g')
          END = ${phoneDigits}
          ORDER BY profile."updatedAt" DESC
          LIMIT 20
        `)
      : [];

    duplicateAttempts = tableState.duplicateAttempts
      ? await prisma.$queryRaw<DuplicateAttemptRow[]>(Prisma.sql`
          SELECT
            "id", "teamId", "displayName", "email", "phone", "matchType",
            "matchedRecordId", "matchedTeamId", "reason", "createdAt"
          FROM "PlayerDuplicateAttempt"
          WHERE CASE
            WHEN REGEXP_REPLACE(COALESCE("phone", ''), '[^0-9]', '', 'g') LIKE '0%'
              THEN '44' || SUBSTRING(REGEXP_REPLACE(COALESCE("phone", ''), '[^0-9]', '', 'g') FROM 2)
            WHEN REGEXP_REPLACE(COALESCE("phone", ''), '[^0-9]', '', 'g') LIKE '44%'
              THEN REGEXP_REPLACE(COALESCE("phone", ''), '[^0-9]', '', 'g')
            ELSE '44' || REGEXP_REPLACE(COALESCE("phone", ''), '[^0-9]', '', 'g')
          END = ${phoneDigits}
          ORDER BY "createdAt" DESC
          LIMIT 20
        `)
      : [];
  }

  if (queryType === "name" && name) {
    [users, memberships, prospects, leads, teams, notificationRecipients] = await Promise.all([
      prisma.$queryRaw<UserRow[]>(Prisma.sql`
        SELECT "id", "name", "email", "role"::text AS "role"
        FROM "User"
        WHERE LOWER(REGEXP_REPLACE(BTRIM(COALESCE("name", '')), '[[:space:]]+', ' ', 'g')) = ${name}
        ORDER BY "email" NULLS LAST, "id"
      `),
      prisma.$queryRaw<MembershipRow[]>(Prisma.sql`
        SELECT
          member."id" AS "membershipId",
          player_user."id" AS "userId",
          player_user."name" AS "userName",
          player_user."email" AS "userEmail",
          member."role"::text AS "memberRole",
          team."id" AS "teamId",
          team."name" AS "teamName",
          profile."phone" AS "phone"
        FROM "TeamMember" member
        JOIN "User" player_user ON player_user."id" = member."userId"
        JOIN "Team" team ON team."id" = member."teamId"
        LEFT JOIN "TeamMemberProfile" profile ON profile."teamMemberId" = member."id"
        WHERE LOWER(REGEXP_REPLACE(BTRIM(COALESCE(player_user."name", '')), '[[:space:]]+', ' ', 'g')) = ${name}
        ORDER BY team."name", member."id"
      `),
      prisma.$queryRaw<ProspectRow[]>(Prisma.sql`
        SELECT
          prospect."id",
          prospect."firstName",
          prospect."lastName",
          prospect."email",
          prospect."phone",
          prospect."status",
          team."id" AS "teamId",
          team."name" AS "teamName"
        FROM "TeamPlayerProspect" prospect
        LEFT JOIN "Team" team ON team."id" = prospect."teamId"
        WHERE LOWER(
          REGEXP_REPLACE(
            BTRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")),
            '[[:space:]]+', ' ', 'g'
          )
        ) = ${name}
        ORDER BY prospect."updatedAt" DESC
      `),
      prisma.$queryRaw<LeadRow[]>(Prisma.sql`
        SELECT
          lead."id",
          lead."contactName",
          lead."email",
          lead."phone",
          lead."interestType"::text AS "interestType",
          lead."status"::text AS "status",
          league."name" AS "leagueName"
        FROM "InterestLead" lead
        LEFT JOIN "League" league ON league."id" = lead."leagueId"
        WHERE LOWER(REGEXP_REPLACE(BTRIM(COALESCE(lead."contactName", '')), '[[:space:]]+', ' ', 'g')) = ${name}
        ORDER BY lead."createdAt" DESC
      `),
      prisma.$queryRaw<TeamContactRow[]>(Prisma.sql`
        SELECT
          "id", "name", "contactName", "contactEmail", "contactPhone",
          "secondaryContactName", "secondaryContactEmail", "secondaryContactPhone",
          "captainInviteSentTo"
        FROM "Team"
        WHERE LOWER(REGEXP_REPLACE(BTRIM(COALESCE("contactName", '')), '[[:space:]]+', ' ', 'g')) = ${name}
           OR LOWER(REGEXP_REPLACE(BTRIM(COALESCE("secondaryContactName", '')), '[[:space:]]+', ' ', 'g')) = ${name}
        ORDER BY "name"
      `),
      prisma.$queryRaw<NotificationRecipientRow[]>(Prisma.sql`
        SELECT
          "id",
          "sourceType"::text AS "sourceType",
          "sourceId",
          "displayName",
          COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), '')) AS "email",
          COALESCE(NULLIF(BTRIM("phoneNormalized"), ''), NULLIF(BTRIM("phone"), '')) AS "phone"
        FROM "NotificationRecipient"
        WHERE LOWER(REGEXP_REPLACE(BTRIM(COALESCE("displayName", '')), '[[:space:]]+', ' ', 'g')) = ${name}
        ORDER BY "updatedAt" DESC
        LIMIT 20
      `),
    ]);

    playerPoolRows = tableState.playerPool
      ? await prisma.$queryRaw<PlayerPoolRow[]>(Prisma.sql`
          SELECT
            profile."id",
            prospect."id" AS "prospectId",
            prospect."firstName",
            prospect."lastName",
            prospect."email",
            prospect."phone",
            profile."status"::text AS "status",
            league."name" AS "leagueName"
          FROM "PlayerPoolProfile" profile
          JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
          LEFT JOIN "League" league ON league."id" = profile."leagueId"
          WHERE LOWER(
            REGEXP_REPLACE(
              BTRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")),
              '[[:space:]]+', ' ', 'g'
            )
          ) = ${name}
          ORDER BY profile."updatedAt" DESC
          LIMIT 20
        `)
      : [];

    duplicateAttempts = tableState.duplicateAttempts
      ? await prisma.$queryRaw<DuplicateAttemptRow[]>(Prisma.sql`
          SELECT
            "id", "teamId", "displayName", "email", "phone", "matchType",
            "matchedRecordId", "matchedTeamId", "reason", "createdAt"
          FROM "PlayerDuplicateAttempt"
          WHERE LOWER(REGEXP_REPLACE(BTRIM(COALESCE("displayName", '')), '[[:space:]]+', ' ', 'g')) = ${name}
          ORDER BY "createdAt" DESC
          LIMIT 20
        `)
      : [];
  }

  const matches: LookupMatch[] = [];

  for (const attempt of duplicateAttempts) {
    const teamId = attempt.matchedTeamId || attempt.teamId;
    matches.push({
      source: "Blocked player creation attempt",
      title: `${attempt.displayName || rawQuery} · ${attempt.matchType.replaceAll("_", " ")}`,
      detail: `${attempt.reason} Attempted ${formatAttemptDate(attempt.createdAt)}.`,
      effect:
        "This is the exact duplicate-player safeguard result. It explains what stopped the player being added.",
      href: teamId ? `/admin/teams/${teamId}/players` : null,
      recordId: attempt.matchedRecordId,
      tone: "amber",
    });
  }

  for (const membership of memberships) {
    matches.push({
      source: "Squad membership",
      title: `${membership.userName || membership.userEmail || "Unnamed player"} · ${membership.teamName}`,
      detail: `${membership.memberRole}${membership.userEmail ? ` · ${membership.userEmail}` : ""}${membership.phone ? ` · ${membership.phone}` : ""}`,
      effect: identityStrengthCopy(queryType),
      href: `/admin/teams/${membership.teamId}/players`,
      recordId: membership.membershipId,
      tone: queryType === "name" ? "sky" : "amber",
    });
  }

  for (const prospect of prospects) {
    const prospectName = fullName(prospect.firstName, prospect.lastName) || "Unnamed prospect";
    matches.push({
      source: prospect.teamName ? "Team player prospect" : "Unassigned player prospect",
      title: prospect.teamName ? `${prospectName} · ${prospect.teamName}` : prospectName,
      detail: `Status: ${prospect.status}${prospect.email ? ` · ${prospect.email}` : ""}${prospect.phone ? ` · ${prospect.phone}` : ""}`,
      effect:
        queryType === "name"
          ? `${identityStrengthCopy(queryType)} If it is the same person, this prospect can block creation of another player identity.`
          : "This record can stop a second player record being created. The existing prospect should be reused, moved or resolved instead.",
      href: prospect.teamId
        ? `/admin/teams/${prospect.teamId}/prospects`
        : "/admin/player-pool",
      recordId: prospect.id,
      tone: "amber",
    });
  }

  for (const profile of playerPoolRows) {
    const profileName = fullName(profile.firstName, profile.lastName) || "Unnamed PlayerPool profile";
    matches.push({
      source: "PlayerPool profile",
      title: profileName,
      detail: `${profile.leagueName || "League not set"} · Status: ${profile.status}${profile.email ? ` · ${profile.email}` : ""}${profile.phone ? ` · ${profile.phone}` : ""}`,
      effect:
        queryType === "name"
          ? `${identityStrengthCopy(queryType)} If confirmed, reuse this PlayerPool identity rather than creating another.`
          : "This is an existing PlayerPool identity and should be reused rather than creating another prospect/player record.",
      href: `/admin/player-pool/${profile.id}`,
      recordId: profile.id,
      tone: "amber",
    });
  }

  for (const user of users) {
    matches.push({
      source: "User account",
      title: user.name || "Unnamed user",
      detail: `${user.email || "No email"} · ${user.role}`,
      effect:
        queryType === "name"
          ? identityStrengthCopy(queryType)
          : "An existing User can be reused as the player identity. It does not automatically mean the add should fail.",
      href: user.email
        ? `/admin/users?q=${encodeURIComponent(user.email)}`
        : `/admin/users?q=${encodeURIComponent(user.name || rawQuery)}`,
      recordId: user.id,
      tone: "sky",
    });
  }

  for (const lead of leads) {
    matches.push({
      source: "Interest lead",
      title: lead.contactName || "Unnamed lead",
      detail: `${lead.interestType} · ${lead.status}${lead.leagueName ? ` · ${lead.leagueName}` : ""}${lead.email ? ` · ${lead.email}` : ""}${lead.phone ? ` · ${lead.phone}` : ""}`,
      effect:
        "A lead record by itself does not block somebody being set up as a player.",
      href: `/admin/leads/${lead.id}`,
      recordId: lead.id,
      tone: "emerald",
    });
  }

  for (const team of teams) {
    if (
      (queryType === "email" && email && sameEmail(team.contactEmail, email)) ||
      (queryType === "phone" && phoneDigits && samePhone(team.contactPhone, phoneDigits)) ||
      (queryType === "name" && name && sameName(team.contactName, name))
    ) {
      matches.push({
        source: "Team primary contact",
        title: team.name,
        detail: `${team.contactName || "Unnamed contact"}${team.contactEmail ? ` · ${team.contactEmail}` : ""}${team.contactPhone ? ` · ${team.contactPhone}` : ""}`,
        effect: "A team contact record by itself does not block player creation.",
        href: `/admin/teams/${team.id}`,
        recordId: team.id,
        tone: "default",
      });
    }

    if (
      (queryType === "email" && email && sameEmail(team.secondaryContactEmail, email)) ||
      (queryType === "phone" && phoneDigits && samePhone(team.secondaryContactPhone, phoneDigits)) ||
      (queryType === "name" && name && sameName(team.secondaryContactName, name))
    ) {
      matches.push({
        source: "Team secondary contact",
        title: team.name,
        detail: `${team.secondaryContactName || "Unnamed contact"}${team.secondaryContactEmail ? ` · ${team.secondaryContactEmail}` : ""}${team.secondaryContactPhone ? ` · ${team.secondaryContactPhone}` : ""}`,
        effect: "A team contact record by itself does not block player creation.",
        href: `/admin/teams/${team.id}`,
        recordId: team.id,
        tone: "default",
      });
    }

    if (queryType === "email" && email && sameEmail(team.captainInviteSentTo, email)) {
      matches.push({
        source: "Captain invitation",
        title: team.name,
        detail: `Invitation sent to ${email}`,
        effect: "A captain invitation by itself does not block player creation.",
        href: `/admin/teams/${team.id}`,
        recordId: team.id,
        tone: "default",
      });
    }
  }

  for (const recipient of notificationRecipients) {
    matches.push({
      source: "Notification recipient",
      title: recipient.displayName || recipient.sourceType,
      detail: `${recipient.sourceType}${recipient.email ? ` · ${recipient.email}` : ""}${recipient.phone ? ` · ${recipient.phone}` : ""}${recipient.sourceId ? ` · source ${recipient.sourceId}` : ""}`,
      effect:
        "A notification-recipient record is communication metadata and does not by itself block player creation.",
      href: null,
      recordId: recipient.id,
      tone: "default",
    });
  }

  return NextResponse.json({
    ok: true,
    query: rawQuery,
    queryType,
    normalisedQuery: email ?? phoneDigits ?? name,
    matchCount: matches.length,
    matches,
  });
}
