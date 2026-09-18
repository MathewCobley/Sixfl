// ========================================
// File: src/lib/messaging/thread-player-target.ts
// ========================================

import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { prisma } from "@/lib/prisma";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";
import { getMessageThreadById } from "@/lib/messaging/service";

type MessageThread = NonNullable<Awaited<ReturnType<typeof getMessageThreadById>>>;

export type ThreadPlayerTarget =
  | {
      kind: "PROSPECT";
      id: string;
      teamId: string;
      name: string;
      status: string;
      href: string;
      canStopChasing: boolean;
    }
  | {
      kind: "MEMBER";
      id: string;
      teamId: string;
      name: string;
      status: null;
      href: string;
      canStopChasing: false;
    };

const PROSPECT_SOURCE_TYPES = new Set([
  "TEAM_PLAYER_PROSPECT",
  "MANAGED_SQUAD_JOIN_CONFIRMATION",
  "MANAGED_SQUAD_REGISTRATION_REMINDER",
  "MANAGED_SQUAD_JOIN_CHASE",
  "MANAGED_SQUAD_JOIN_FINAL_CHASE",
]);

const STOPPABLE_PROSPECT_STATUSES = new Set([
  "NEW",
  "CONTACTED",
  "TRIAL",
  "BACKUP",
  "QUALIFIED",
]);

function metadataRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function metadataString(value: unknown, key: string) {
  const record = metadataRecord(value);
  const item = record?.[key];

  return typeof item === "string" && item.trim() ? item.trim() : null;
}

function normaliseEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function getProspectCandidateIds(thread: MessageThread) {
  const ids = new Set<string>();

  if (thread.sourceId && PROSPECT_SOURCE_TYPES.has(thread.sourceType ?? "")) {
    ids.add(thread.sourceId);
  }

  const recipientSourceId = thread.recipient?.sourceId?.trim();
  if (recipientSourceId?.startsWith("team-prospect:")) {
    const id = recipientSourceId.slice("team-prospect:".length).trim();
    if (id) ids.add(id);
  }

  const recipientProspectId = metadataString(thread.recipient?.metadata, "prospectId");
  if (recipientProspectId) ids.add(recipientProspectId);

  for (const message of thread.messages) {
    const prospectId = metadataString(message.dispatch?.metadata, "prospectId");
    if (prospectId) ids.add(prospectId);
  }

  return [...ids];
}

function getMemberCandidateIds(thread: MessageThread) {
  const ids = new Set<string>();

  if (thread.sourceType === "TEAM_MEMBER" && thread.sourceId?.trim()) {
    ids.add(thread.sourceId.trim());
  }

  for (const message of thread.messages) {
    const membershipId = metadataString(message.dispatch?.metadata, "teamMemberId");
    if (membershipId) ids.add(membershipId);
  }

  return [...ids];
}

function prospectTarget(prospect: {
  id: string;
  teamId: string | null;
  firstName: string;
  lastName: string | null;
  status: string;
}): ThreadPlayerTarget | null {
  if (!prospect.teamId) return null;

  const name =
    [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim() ||
    prospect.firstName;

  return {
    kind: "PROSPECT",
    id: prospect.id,
    teamId: prospect.teamId,
    name,
    status: prospect.status,
    href: `/admin/teams/${prospect.teamId}/prospects/${prospect.id}/communications`,
    canStopChasing: STOPPABLE_PROSPECT_STATUSES.has(prospect.status),
  };
}

function memberTarget(member: {
  id: string;
  teamId: string;
  user: { name: string | null; email: string | null };
}): ThreadPlayerTarget {
  return {
    kind: "MEMBER",
    id: member.id,
    teamId: member.teamId,
    name: member.user.name?.trim() || member.user.email?.trim() || "Player",
    status: null,
    href: `/admin/teams/${member.teamId}/players/${member.id}/communications`,
    canStopChasing: false,
  };
}

export async function resolveThreadPlayerTarget(
  thread: MessageThread,
): Promise<ThreadPlayerTarget | null> {
  const teamId = thread.teamId ?? thread.team?.id ?? null;
  const prospectCandidateIds = getProspectCandidateIds(thread);

  if (prospectCandidateIds.length > 0) {
    const prospects = await prisma.teamPlayerProspect.findMany({
      where: {
        id: { in: prospectCandidateIds },
        ...(teamId ? { OR: [{ teamId }, { teamId: null }] } : {}),
      },
      select: {
        id: true,
        teamId: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    const attached = teamId
      ? prospects.filter((prospect) => prospect.teamId === teamId)
      : prospects;

    if (attached.length === 1) {
      const target = prospectTarget(attached[0]);
      if (target) return target;
    }
  }

  const memberCandidateIds = getMemberCandidateIds(thread);
  if (memberCandidateIds.length > 0) {
    const members = await prisma.teamMember.findMany({
      where: {
        id: { in: memberCandidateIds },
        ...(teamId ? { teamId } : {}),
      },
      select: {
        id: true,
        teamId: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (members.length === 1) {
      return memberTarget(members[0]);
    }
  }

  if (!teamId) return null;

  const emails = new Set(
    [
      thread.contactEmail,
      thread.emailNormalized,
      thread.recipient?.email,
    ]
      .map(normaliseEmail)
      .filter((value): value is string => Boolean(value)),
  );

  const phones = new Set(
    [
      thread.contactPhone,
      thread.phoneNormalized,
      thread.recipient?.phone,
    ]
      .map((value) => normalizePhoneNumber(value))
      .filter((value): value is string => Boolean(value)),
  );

  if (emails.size === 0 && phones.size === 0) return null;

  const [prospects, members] = await Promise.all([
    prisma.teamPlayerProspect.findMany({
      where: { teamId },
      select: {
        id: true,
        teamId: true,
        firstName: true,
        lastName: true,
        status: true,
        email: true,
        phone: true,
      },
    }),
    prisma.teamMember.findMany({
      where: { teamId },
      select: {
        id: true,
        teamId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const matchingProspects = prospects.filter((prospect) => {
    const email = normaliseEmail(prospect.email);
    const phone = normalizePhoneNumber(prospect.phone);

    return Boolean(
      (email && emails.has(email)) ||
      (phone && phones.has(phone)),
    );
  });

  if (matchingProspects.length === 1) {
    const prospect = matchingProspects[0];

    if (
      prospect.status !== "ACTIVE_SQUAD" ||
      members.every(
        (member) => normaliseEmail(member.user.email) !== normaliseEmail(prospect.email),
      )
    ) {
      return prospectTarget(prospect);
    }
  }

  const profiles = await getTeamMemberProfilesByTeamMemberIds(
    members.map((member) => member.id),
  );

  const matchingMembers = members.filter((member) => {
    const email = normaliseEmail(member.user.email);
    const phone = normalizePhoneNumber(profiles.get(member.id)?.phone ?? null);

    return Boolean(
      (email && emails.has(email)) ||
      (phone && phones.has(phone)),
    );
  });

  if (matchingMembers.length === 1) {
    return memberTarget(matchingMembers[0]);
  }

  if (matchingProspects.length === 1) {
    return prospectTarget(matchingProspects[0]);
  }

  return null;
}

export async function resolveThreadPlayerTargetById(threadId: string) {
  const thread = await getMessageThreadById(threadId);
  if (!thread) return null;

  return resolveThreadPlayerTarget(thread);
}
