import { TeamRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

export type SquadMemberCreationInput = {
  id: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
  role: TeamRole;
  createdAt: Date;
};

export type SquadMemberCreationDetails = {
  method: string;
  createdBy: string;
  detail: string | null;
  sourceRecordHref: string | null;
  inferred: boolean;
};

function normaliseEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function normaliseName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function prospectName(prospect: { firstName: string; lastName: string | null }) {
  return [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim();
}

function humaniseSource(value: string | null | undefined) {
  const source = value?.trim();
  if (!source) return null;

  const known: Record<string, string> = {
    PLAYER_POOL: "Player Pool",
    PLAYERPOOL: "Player Pool",
    REGISTER_INTEREST: "player registration",
    REGISTRATION: "player registration",
    MANUAL: "manual prospect entry",
    ADMIN: "admin prospect entry",
    CAPTAIN: "captain prospect entry",
    WEBSITE: "website enquiry",
  };

  const key = source.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return known[key] ?? source.replaceAll("_", " ").replaceAll("-", " ");
}

function actorLabel(actor: { name: string | null; email: string | null } | null) {
  return actor?.name?.trim() || actor?.email?.trim() || null;
}

export async function getSquadMemberCreationDetailsMap(input: {
  teamId: string;
  members: SquadMemberCreationInput[];
}) {
  const result = new Map<string, SquadMemberCreationDetails>();
  if (input.members.length === 0) return result;

  const membershipIds = input.members.map((member) => member.id);
  const userIds = input.members.map((member) => member.user.id);

  const [profiles, team, users, prospects] = await Promise.all([
    getTeamMemberProfilesByTeamMemberIds(membershipIds),
    prisma.team.findUnique({
      where: { id: input.teamId },
      select: {
        captainUserId: true,
        captainLinkedAt: true,
        captainLinkedSource: true,
        captainClaimedAt: true,
        captainClaimSource: true,
      },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        createdFromLeadId: true,
      },
    }),
    prisma.teamPlayerProspect.findMany({
      where: { teamId: input.teamId },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        source: true,
        status: true,
        createdAt: true,
        lastContactedAt: true,
      },
    }),
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));
  const leadIds = Array.from(
    new Set(
      users
        .map((user) => user.createdFromLeadId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const leads = leadIds.length
    ? await prisma.interestLead.findMany({
        where: { id: { in: leadIds } },
        select: {
          id: true,
          source: true,
          contactName: true,
          createdAt: true,
          convertedAt: true,
        },
      })
    : [];
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  const prospectById = new Map(prospects.map((prospect) => [prospect.id, prospect]));
  const prospectByEmail = new Map<string, typeof prospects>();
  const prospectByName = new Map<string, typeof prospects>();

  for (const prospect of prospects) {
    const email = normaliseEmail(prospect.email);
    if (email) {
      const rows = prospectByEmail.get(email) ?? [];
      rows.push(prospect);
      prospectByEmail.set(email, rows);
    }

    const name = normaliseName(prospectName(prospect));
    if (name) {
      const rows = prospectByName.get(name) ?? [];
      rows.push(prospect);
      prospectByName.set(name, rows);
    }
  }

  const matchedProspectByMembershipId = new Map<
    string,
    { prospect: (typeof prospects)[number]; inferred: boolean; matchReason: string }
  >();

  for (const member of input.members) {
    const profileProspectId = profiles.get(member.id)?.sourceProspectId ?? null;
    const exactProspect = profileProspectId
      ? prospectById.get(profileProspectId) ?? null
      : null;

    if (exactProspect) {
      matchedProspectByMembershipId.set(member.id, {
        prospect: exactProspect,
        inferred: false,
        matchReason: "linked prospect record",
      });
      continue;
    }

    const email = normaliseEmail(member.user.email);
    const emailMatches = email ? prospectByEmail.get(email) ?? [] : [];
    const activeEmailMatches = emailMatches.filter((prospect) =>
      ["ACTIVE_SQUAD", "BACKUP"].includes(prospect.status),
    );
    const chosenEmailMatch =
      activeEmailMatches.length === 1
        ? activeEmailMatches[0]
        : emailMatches.length === 1
          ? emailMatches[0]
          : null;

    if (chosenEmailMatch) {
      matchedProspectByMembershipId.set(member.id, {
        prospect: chosenEmailMatch,
        inferred: true,
        matchReason: "matched by email",
      });
      continue;
    }

    const name = normaliseName(member.user.name);
    const nameMatches = name ? prospectByName.get(name) ?? [] : [];
    const activeNameMatches = nameMatches.filter((prospect) =>
      ["ACTIVE_SQUAD", "BACKUP"].includes(prospect.status),
    );
    const chosenNameMatch =
      activeNameMatches.length === 1
        ? activeNameMatches[0]
        : nameMatches.length === 1
          ? nameMatches[0]
          : null;

    if (chosenNameMatch) {
      matchedProspectByMembershipId.set(member.id, {
        prospect: chosenNameMatch,
        inferred: true,
        matchReason: "matched by name",
      });
    }
  }

  const prospectIds = Array.from(
    new Set(
      Array.from(matchedProspectByMembershipId.values()).map(
        (match) => match.prospect.id,
      ),
    ),
  );

  const inviteDispatches = prospectIds.length
    ? await prisma.notificationDispatch.findMany({
        where: {
          sourceType: "MANAGED_SQUAD_JOIN_CONFIRMATION",
          sourceId: { in: prospectIds },
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          sourceId: true,
          createdByUserId: true,
          createdAt: true,
          status: true,
        },
      })
    : [];

  const latestInviteByProspectId = new Map<
    string,
    (typeof inviteDispatches)[number]
  >();
  for (const dispatch of inviteDispatches) {
    if (dispatch.sourceId && !latestInviteByProspectId.has(dispatch.sourceId)) {
      latestInviteByProspectId.set(dispatch.sourceId, dispatch);
    }
  }

  const creatorUserIds = Array.from(
    new Set(
      inviteDispatches
        .map((dispatch) => dispatch.createdByUserId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const creatorUsers = creatorUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorUserIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const creatorById = new Map(creatorUsers.map((user) => [user.id, user]));

  for (const member of input.members) {
    const prospectMatch = matchedProspectByMembershipId.get(member.id) ?? null;

    if (prospectMatch) {
      const { prospect, inferred, matchReason } = prospectMatch;
      const invite = latestInviteByProspectId.get(prospect.id) ?? null;
      const inviter = invite?.createdByUserId
        ? actorLabel(creatorById.get(invite.createdByUserId) ?? null)
        : null;
      const source = humaniseSource(prospect.source);
      const hasExactProfileLink = !inferred;

      result.set(member.id, {
        method: invite && hasExactProfileLink
          ? "Player activated a squad invitation"
          : "Created from a player prospect",
        createdBy: invite && hasExactProfileLink
          ? inviter
            ? `Player completed activation · invitation sent by ${inviter}`
            : "Player completed activation · invitation sender was not recorded"
          : inviter
            ? `Prospect invitation sent by ${inviter}`
            : "Individual creator was not recorded",
        detail: [
          source ? `Original source: ${source}` : null,
          inferred ? `Best available match: ${matchReason}; the original link was not stored.` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        sourceRecordHref: `/admin/teams/${input.teamId}/prospects`,
        inferred,
      });
      continue;
    }

    if (team?.captainUserId === member.user.id && member.role === TeamRole.CAPTAIN) {
      const source = team.captainClaimSource || team.captainLinkedSource || "captain link";
      const sourceLabel = source.toLowerCase().includes("admin")
        ? "Admin captain access override"
        : source.toLowerCase().includes("claim")
          ? "Captain claimed the team"
          : "Captain account linked to team";

      result.set(member.id, {
        method: sourceLabel,
        createdBy: source.toLowerCase().includes("admin")
          ? "SIXFL admin · individual admin was not stored"
          : "Captain through the team claim process",
        detail: `Recorded source: ${source}`,
        sourceRecordHref: null,
        inferred: false,
      });
      continue;
    }

    const user = userById.get(member.user.id);
    const lead = user?.createdFromLeadId
      ? leadById.get(user.createdFromLeadId) ?? null
      : null;

    if (lead) {
      const source = humaniseSource(lead.source);
      result.set(member.id, {
        method: "Account created from a registration lead",
        createdBy: "SIXFL lead conversion · individual admin was not stored",
        detail: source ? `Original source: ${source}` : null,
        sourceRecordHref: `/admin/leads/${lead.id}`,
        inferred: false,
      });
      continue;
    }

    result.set(member.id, {
      method: "Existing account linked directly to the squad",
      createdBy: "Individual creator was not recorded",
      detail:
        "This membership was created before SIXFL stored a complete creation trail for every squad route.",
      sourceRecordHref: null,
      inferred: true,
    });
  }

  return result;
}
