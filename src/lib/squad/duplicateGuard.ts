// ========================================
// File: src/lib/squad/duplicateGuard.ts
// ========================================

import { Prisma } from "@prisma/client";

import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { prisma } from "@/lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

type SquadContactRow = {
  memberId: string;
  userId: string;
  role: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type ProspectContactRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

export type DuplicateCandidate = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type DuplicateMatch = {
  type: "squad" | "prospect";
  id: string;
  name: string;
  reason: "email" | "phone" | "name";
  status?: string;
};

function normaliseEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

export function normaliseDuplicatePhone(value: string | null | undefined) {
  const normalised = normalizePhoneNumber(value?.trim() || null);
  const digits = normalised?.replace(/\D/g, "") || value?.replace(/\D/g, "") || "";

  return digits.length >= 10 ? digits : null;
}

function normaliseNamePart(value: string | null | undefined) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "";
}

function getCandidateName(candidate: DuplicateCandidate) {
  const joined = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ");
  return joined || candidate.name || "";
}

export function getDuplicateNameKey(candidate: DuplicateCandidate) {
  const normalised = normaliseNamePart(getCandidateName(candidate));
  return normalised.length >= 5 ? normalised : null;
}

function getDisplayName(input: { name?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null }) {
  return (
    input.name?.trim() ||
    [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
    input.email?.trim() ||
    input.phone?.trim() ||
    "Unnamed player"
  );
}

async function getTeamMemberContacts(client: DbClient, teamId: string) {
  try {
    return await client.$queryRaw<SquadContactRow[]>`
      SELECT
        tm."id" AS "memberId",
        tm."userId" AS "userId",
        tm."role" AS "role",
        u."name" AS "name",
        u."email" AS "email",
        p."phone" AS "phone"
      FROM "TeamMember" tm
      INNER JOIN "User" u ON u."id" = tm."userId"
      LEFT JOIN "TeamMemberProfile" p ON p."teamMemberId" = tm."id"
      WHERE tm."teamId" = ${teamId}
    `;
  } catch {
    return client.$queryRaw<SquadContactRow[]>`
      SELECT
        tm."id" AS "memberId",
        tm."userId" AS "userId",
        tm."role" AS "role",
        u."name" AS "name",
        u."email" AS "email",
        NULL AS "phone"
      FROM "TeamMember" tm
      INNER JOIN "User" u ON u."id" = tm."userId"
      WHERE tm."teamId" = ${teamId}
    `;
  }
}

async function getTeamProspectContacts(client: DbClient, teamId: string) {
  return client.$queryRaw<ProspectContactRow[]>`
    SELECT
      "id",
      "firstName",
      "lastName",
      "email",
      "phone",
      "status"
    FROM "TeamPlayerProspect"
    WHERE "teamId" = ${teamId}
      AND "status" <> 'DECLINED'
  `;
}

export async function findSquadDuplicateMatches(input: {
  client?: DbClient;
  teamId: string;
  candidate: DuplicateCandidate;
  excludeMemberId?: string | null;
  excludeProspectId?: string | null;
  includeNameOnly?: boolean;
}) {
  const client = input.client ?? prisma;
  const candidateEmail = normaliseEmail(input.candidate.email);
  const candidatePhone = normaliseDuplicatePhone(input.candidate.phone);
  const candidateNameKey = getDuplicateNameKey(input.candidate);

  const [members, prospects] = await Promise.all([
    getTeamMemberContacts(client, input.teamId),
    getTeamProspectContacts(client, input.teamId),
  ]);

  const matches: DuplicateMatch[] = [];

  for (const member of members) {
    if (member.memberId === input.excludeMemberId) continue;

    const memberEmail = normaliseEmail(member.email);
    const memberPhone = normaliseDuplicatePhone(member.phone);
    const memberNameKey = getDuplicateNameKey({ name: member.name });

    if (candidateEmail && memberEmail && candidateEmail === memberEmail) {
      matches.push({ type: "squad", id: member.memberId, name: getDisplayName(member), reason: "email" });
      continue;
    }

    if (candidatePhone && memberPhone && candidatePhone === memberPhone) {
      matches.push({ type: "squad", id: member.memberId, name: getDisplayName(member), reason: "phone" });
      continue;
    }

    if (input.includeNameOnly && candidateNameKey && memberNameKey && candidateNameKey === memberNameKey) {
      matches.push({ type: "squad", id: member.memberId, name: getDisplayName(member), reason: "name" });
    }
  }

  for (const prospect of prospects) {
    if (prospect.id === input.excludeProspectId) continue;

    const prospectEmail = normaliseEmail(prospect.email);
    const prospectPhone = normaliseDuplicatePhone(prospect.phone);
    const prospectNameKey = getDuplicateNameKey({
      firstName: prospect.firstName,
      lastName: prospect.lastName,
    });

    if (candidateEmail && prospectEmail && candidateEmail === prospectEmail) {
      matches.push({ type: "prospect", id: prospect.id, name: getDisplayName(prospect), reason: "email", status: prospect.status });
      continue;
    }

    if (candidatePhone && prospectPhone && candidatePhone === prospectPhone) {
      matches.push({ type: "prospect", id: prospect.id, name: getDisplayName(prospect), reason: "phone", status: prospect.status });
      continue;
    }

    if (input.includeNameOnly && candidateNameKey && prospectNameKey && candidateNameKey === prospectNameKey) {
      matches.push({ type: "prospect", id: prospect.id, name: getDisplayName(prospect), reason: "name", status: prospect.status });
    }
  }

  return matches;
}

export function getDuplicateBlockMessage(matches: DuplicateMatch[]) {
  const blockingMatch = matches.find((match) => match.reason === "email" || match.reason === "phone");

  if (!blockingMatch) return null;

  const location = blockingMatch.type === "squad" ? "the squad" : "the prospects list";
  const reason = blockingMatch.reason === "email" ? "email address" : "phone number";

  return `${blockingMatch.name} already appears in ${location} with the same ${reason}. Use the existing record instead of adding a duplicate.`;
}

export async function removeDuplicatePlaceholderMemberForActivation(input: {
  client: DbClient;
  teamId: string;
  userId: string;
  phone?: string | null;
}) {
  const phone = normaliseDuplicatePhone(input.phone);
  if (!phone) return null;

  const members = await getTeamMemberContacts(input.client, input.teamId);
  const placeholder = members.find((member) => {
    if (member.userId === input.userId) return false;
    if (member.email?.trim()) return false;
    if (!["PLAYER", "BACKUP_PLAYER"].includes(member.role)) return false;

    return normaliseDuplicatePhone(member.phone) === phone;
  });

  if (!placeholder) return null;

  await input.client.teamMember.delete({
    where: { id: placeholder.memberId },
  });

  return placeholder.memberId;
}
