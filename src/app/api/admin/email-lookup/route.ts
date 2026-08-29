import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LookupMatch = {
  source: string;
  title: string;
  detail: string;
  effect: string;
  href: string | null;
  recordId: string | null;
  tone: "default" | "amber" | "emerald" | "sky";
};

type NotificationRecipientRow = {
  id: string;
  sourceType: string;
  sourceId: string;
  displayName: string | null;
  email: string | null;
};

type PlayerPoolRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  status: string;
  leagueName: string | null;
};

type DuplicateAttemptRow = {
  id: string;
  teamId: string;
  displayName: string;
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

function sameEmail(value: string | null | undefined, email: string) {
  return normaliseEmail(value) === email;
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

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const email = normaliseEmail(url.searchParams.get("email"));
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const [users, teams, prospects, leads, optionalTables] = await Promise.all([
    prisma.user.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.team.findMany({
      where: {
        OR: [
          { contactEmail: { equals: email, mode: "insensitive" } },
          { secondaryContactEmail: { equals: email, mode: "insensitive" } },
          { captainInviteSentTo: { equals: email, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        contactName: true,
        contactEmail: true,
        secondaryContactName: true,
        secondaryContactEmail: true,
        captainInviteSentTo: true,
      },
    }),
    prisma.teamPlayerProspect.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        team: { select: { id: true, name: true } },
      },
    }),
    prisma.interestLead.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        contactName: true,
        interestType: true,
        status: true,
        league: { select: { name: true } },
      },
    }),
    prisma.$queryRaw<Array<{ playerPool: boolean; duplicateAttempts: boolean }>>(Prisma.sql`
      SELECT
        to_regclass('"PlayerPoolProfile"') IS NOT NULL AS "playerPool",
        to_regclass('"PlayerDuplicateAttempt"') IS NOT NULL AS "duplicateAttempts"
    `),
  ]);

  const tableState = optionalTables[0] ?? {
    playerPool: false,
    duplicateAttempts: false,
  };

  const [notificationRecipients, playerPoolRows, duplicateAttempts] =
    await Promise.all([
      prisma.$queryRaw<NotificationRecipientRow[]>(Prisma.sql`
        SELECT
          "id",
          "sourceType"::text AS "sourceType",
          "sourceId",
          "displayName",
          COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), '')) AS "email"
        FROM "NotificationRecipient"
        WHERE LOWER(COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), ''))) = ${email}
        ORDER BY "updatedAt" DESC
        LIMIT 20
      `),
      tableState.playerPool
        ? prisma.$queryRaw<PlayerPoolRow[]>(Prisma.sql`
            SELECT
              profile."id",
              prospect."firstName",
              prospect."lastName",
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
        : Promise.resolve([] as PlayerPoolRow[]),
      tableState.duplicateAttempts
        ? prisma.$queryRaw<DuplicateAttemptRow[]>(Prisma.sql`
            SELECT
              "id",
              "teamId",
              "displayName",
              "matchType",
              "matchedRecordId",
              "matchedTeamId",
              "reason",
              "createdAt"
            FROM "PlayerDuplicateAttempt"
            WHERE LOWER(BTRIM(COALESCE("email", ''))) = ${email}
            ORDER BY "createdAt" DESC
            LIMIT 10
          `)
        : Promise.resolve([] as DuplicateAttemptRow[]),
    ]);

  const matches: LookupMatch[] = [];

  for (const attempt of duplicateAttempts) {
    const teamId = attempt.matchedTeamId || attempt.teamId;
    matches.push({
      source: "Blocked player creation attempt",
      title: `${attempt.displayName || email} · ${attempt.matchType.replaceAll("_", " ")}`,
      detail: `${attempt.reason} Attempted ${formatAttemptDate(attempt.createdAt)}.`,
      effect:
        "This is the exact duplicate-player safeguard result. It explains what stopped the player being added.",
      href: teamId ? `/admin/teams/${teamId}` : null,
      recordId: attempt.matchedRecordId,
      tone: "amber",
    });
  }

  for (const user of users) {
    matches.push({
      source: "User account",
      title: user.name || "Unnamed user",
      detail: `${user.email || email} · ${user.role}`,
      effect:
        "An existing User can be reused as the player identity. It does not automatically mean the add should fail.",
      href: `/admin/users?q=${encodeURIComponent(email)}`,
      recordId: user.id,
      tone: "sky",
    });
  }

  for (const prospect of prospects) {
    const name = fullName(prospect.firstName, prospect.lastName) || "Unnamed prospect";
    matches.push({
      source: prospect.team ? "Team player prospect" : "Unassigned player prospect",
      title: prospect.team ? `${name} · ${prospect.team.name}` : name,
      detail: `Status: ${prospect.status}`,
      effect:
        "This record can stop a second player record being created. The existing prospect should be reused, moved or resolved instead.",
      href: prospect.team
        ? `/admin/teams/${prospect.team.id}/prospects`
        : "/admin/player-pool",
      recordId: prospect.id,
      tone: "amber",
    });
  }

  for (const profile of playerPoolRows) {
    const name = fullName(profile.firstName, profile.lastName) || "Unnamed PlayerPool profile";
    matches.push({
      source: "PlayerPool profile",
      title: name,
      detail: `${profile.leagueName || "League not set"} · Status: ${profile.status}`,
      effect:
        "This is an existing PlayerPool identity and should be reused rather than creating another prospect/player record.",
      href: `/admin/player-pool/${profile.id}`,
      recordId: profile.id,
      tone: "amber",
    });
  }

  for (const lead of leads) {
    matches.push({
      source: "Interest lead",
      title: lead.contactName || "Unnamed lead",
      detail: `${lead.interestType} · ${lead.status}${lead.league?.name ? ` · ${lead.league.name}` : ""}`,
      effect:
        "A lead record by itself does not block somebody being set up as a player.",
      href: `/admin/leads/${lead.id}`,
      recordId: lead.id,
      tone: "emerald",
    });
  }

  for (const team of teams) {
    if (sameEmail(team.contactEmail, email)) {
      matches.push({
        source: "Team primary contact",
        title: team.name,
        detail: team.contactName || email,
        effect: "A team contact email by itself does not block player creation.",
        href: `/admin/teams/${team.id}`,
        recordId: team.id,
        tone: "default",
      });
    }
    if (sameEmail(team.secondaryContactEmail, email)) {
      matches.push({
        source: "Team secondary contact",
        title: team.name,
        detail: team.secondaryContactName || email,
        effect: "A team contact email by itself does not block player creation.",
        href: `/admin/teams/${team.id}`,
        recordId: team.id,
        tone: "default",
      });
    }
    if (sameEmail(team.captainInviteSentTo, email)) {
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
      detail: `${recipient.sourceType} · source ${recipient.sourceId}`,
      effect:
        "A notification-recipient record is communication metadata and does not by itself block player creation.",
      href: null,
      recordId: recipient.id,
      tone: "default",
    });
  }

  return NextResponse.json({
    ok: true,
    email,
    matchCount: matches.length,
    matches,
  });
}
