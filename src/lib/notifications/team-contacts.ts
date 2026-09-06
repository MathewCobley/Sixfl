// ========================================
// File: src/lib/notifications/team-contacts.ts
// ========================================

import {
  NotificationAudience,
  NotificationRecipientSourceType,
  TeamRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getNotificationRecipientBySource,
  upsertNotificationRecipient,
} from "@/lib/notifications/recipients";
import {
  getPhoneDisplayValue,
  normalizePhoneNumber,
} from "@/lib/notifications/phone";
import { syncTeamCaptainPhonesFromKnownContacts } from "@/lib/notifications/team-captain-contact-sync";

export type TeamContactPoint = {
  key: string;
  label: string;
  source: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};

export type TeamContactSnapshot = {
  teamId: string;
  teamName: string;
  leagueId: string | null;
  leagueName: string | null;
  primaryContact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
  };
  contacts: TeamContactPoint[];
  recipient: Awaited<ReturnType<typeof getNotificationRecipientBySource>>;
};

function cleanValue(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function displayPhone(value: string | null | undefined) {
  return getPhoneDisplayValue(value);
}

function getPreferredSmsPhone(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const normalized = normalizePhoneNumber(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function getPreferredEmail(
  contacts: TeamContactPoint[],
  recipientEmail?: string | null,
) {
  return (
    contacts.find((contact) => cleanValue(contact.email))?.email ??
    cleanValue(recipientEmail)
  );
}

function contactKey(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source: string;
}) {
  return [
    cleanValue(input.name) ?? "",
    cleanValue(input.email)?.toLowerCase() ?? "",
    displayPhone(input.phone) ?? "",
    input.source,
  ].join("::");
}

function getRoleLabel(role: TeamRole) {
  switch (role) {
    case "CAPTAIN":
      return "Captain";
    case "MANAGER":
      return "Manager";
    case "COACH":
      return "Coach";
    case "PLAYER":
      return "Player";
    default:
      return role;
  }
}

export async function getTeamContactSnapshot(
  teamId: string,
): Promise<TeamContactSnapshot | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      leagueId: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      secondaryContactName: true,
      secondaryContactEmail: true,
      secondaryContactPhone: true,
      league: {
        select: {
          name: true,
        },
      },
      createdByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      convertedFromLead: {
        select: {
          id: true,
          contactName: true,
          email: true,
          phone: true,
        },
      },
      members: {
        where: {
          role: {
            in: ["MANAGER", "CAPTAIN"],
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!team) {
    return null;
  }

  const { profiles: captainProfiles } =
    await syncTeamCaptainPhonesFromKnownContacts(team.id);

  const recipient = await getNotificationRecipientBySource({
    sourceType: NotificationRecipientSourceType.TEAM,
    sourceId: team.id,
  });

  const contacts: TeamContactPoint[] = [];
  const seen = new Set<string>();

  const primaryManualKey = contactKey({
    name: team.contactName,
    email: team.contactEmail,
    phone: team.contactPhone,
    source: "team:primary",
  });

  if (
    cleanValue(team.contactName) ||
    cleanValue(team.contactEmail) ||
    cleanValue(team.contactPhone)
  ) {
    seen.add(primaryManualKey);
    contacts.push({
      key: primaryManualKey,
      label: "Primary team contact",
      source: "Team record",
      name: cleanValue(team.contactName),
      email: cleanValue(team.contactEmail),
      phone: displayPhone(team.contactPhone),
      isPrimary: true,
    });
  }

  const secondaryManualKey = contactKey({
    name: team.secondaryContactName,
    email: team.secondaryContactEmail,
    phone: team.secondaryContactPhone,
    source: "team:secondary",
  });

  if (
    cleanValue(team.secondaryContactName) ||
    cleanValue(team.secondaryContactEmail) ||
    cleanValue(team.secondaryContactPhone)
  ) {
    if (!seen.has(secondaryManualKey)) {
      seen.add(secondaryManualKey);
      contacts.push({
        key: secondaryManualKey,
        label: "Secondary contact",
        source: "Team record",
        name: cleanValue(team.secondaryContactName),
        email: cleanValue(team.secondaryContactEmail),
        phone: displayPhone(team.secondaryContactPhone),
        isPrimary: false,
      });
    }
  }

  for (const member of team.members) {
    const memberPhone = displayPhone(captainProfiles.get(member.id)?.phone);
    const key = contactKey({
      name: member.user.name,
      email: member.user.email,
      phone: memberPhone,
      source: `member:${member.id}`,
    });

    if (seen.has(key)) continue;
    seen.add(key);

    contacts.push({
      key,
      label: getRoleLabel(member.role),
      source: "Team member",
      name: cleanValue(member.user.name),
      email: cleanValue(member.user.email),
      phone: memberPhone,
      isPrimary: contacts.length === 0,
    });
  }

  if (team.convertedFromLead) {
    const key = contactKey({
      name: team.convertedFromLead.contactName,
      email: team.convertedFromLead.email,
      phone: team.convertedFromLead.phone,
      source: `lead:${team.convertedFromLead.id}`,
    });

    if (!seen.has(key)) {
      seen.add(key);
      contacts.push({
        key,
        label: "Lead contact",
        source: "Converted lead",
        name: cleanValue(team.convertedFromLead.contactName),
        email: cleanValue(team.convertedFromLead.email),
        phone: displayPhone(team.convertedFromLead.phone),
        isPrimary: contacts.length === 0,
      });
    }
  }

  if (team.createdByUser) {
    const key = contactKey({
      name: team.createdByUser.name,
      email: team.createdByUser.email,
      source: `creator:${team.createdByUser.id}`,
    });

    if (!seen.has(key)) {
      seen.add(key);
      contacts.push({
        key,
        label: "Created by",
        source: "Admin / user record",
        name: cleanValue(team.createdByUser.name),
        email: cleanValue(team.createdByUser.email),
        phone: null,
        isPrimary: contacts.length === 0,
      });
    }
  }

  if (recipient && (recipient.displayName || recipient.email || recipient.phone)) {
    const key = contactKey({
      name: recipient.displayName,
      email: recipient.email,
      phone: recipient.phone,
      source: `recipient:${recipient.id}`,
    });

    if (!seen.has(key)) {
      seen.add(key);
      contacts.push({
        key,
        label: "Messaging contact",
        source: "Notification recipient",
        name: cleanValue(recipient.displayName),
        email: cleanValue(recipient.email),
        phone: displayPhone(recipient.phone),
        isPrimary: contacts.length === 0,
      });
    }
  }

  const primary = contacts[0] ?? null;

  return {
    teamId: team.id,
    teamName: team.name,
    leagueId: team.leagueId,
    leagueName: team.league?.name ?? null,
    primaryContact: {
      name: primary?.name ?? null,
      email: getPreferredEmail(contacts, recipient?.email),
      phone: getPreferredSmsPhone(
        primary?.phone,
        recipient?.phone,
        team.contactPhone,
        team.secondaryContactPhone,
        team.convertedFromLead?.phone,
      ),
      source: primary?.source ?? null,
    },
    contacts,
    recipient,
  };
}

export async function upsertTeamNotificationRecipient(teamId: string) {
  const snapshot = await getTeamContactSnapshot(teamId);

  if (!snapshot) {
    throw new Error("Team not found.");
  }

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.TEAM,
    sourceId: snapshot.teamId,
    audience: NotificationAudience.TEAM,
    displayName: snapshot.primaryContact.name ?? snapshot.teamName,
    email: snapshot.primaryContact.email,
    phone: snapshot.primaryContact.phone,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    metadata: {
      teamId: snapshot.teamId,
      teamName: snapshot.teamName,
      leagueId: snapshot.leagueId,
      leagueName: snapshot.leagueName,
      contacts: snapshot.contacts.map((contact) => ({
        label: contact.label,
        source: contact.source,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        isPrimary: contact.isPrimary,
      })),
    },
  });

  return {
    snapshot,
    recipient,
  };
}
