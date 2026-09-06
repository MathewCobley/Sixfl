// ========================================
// File: src/lib/notifications/team-captain-contact-sync.ts
// ========================================

import { randomUUID } from "node:crypto";
import { TeamRole } from "@prisma/client";

import { getPhoneDisplayValue, normalizePhoneNumber } from "@/lib/notifications/phone";
import { prisma } from "@/lib/prisma";
import {
  getTeamMemberProfilesByTeamMemberIds,
  type TeamMemberProfile,
} from "@/lib/teamMemberProfiles";

function normaliseEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

type KnownContact = {
  email: string | null;
  phone: string | null;
};

function addKnownContact(
  candidatesByEmail: Map<string, Map<string, string>>,
  contact: KnownContact,
) {
  const email = normaliseEmail(contact.email);
  const displayPhone = getPhoneDisplayValue(contact.phone);
  const phoneKey = normalizePhoneNumber(displayPhone)?.replace(/\D/g, "") || null;

  if (!email || !displayPhone || !phoneKey) return;

  const phones = candidatesByEmail.get(email) ?? new Map<string, string>();
  if (!phones.has(phoneKey)) phones.set(phoneKey, displayPhone);
  candidatesByEmail.set(email, phones);
}

export type CaptainPhoneSyncResult = {
  updated: number;
  matched: number;
  conflicts: number;
  profiles: Map<string, TeamMemberProfile>;
};

/**
 * Copy a known team/lead mobile number onto the matching captain membership
 * when the email address identifies that captain and every known number for
 * that team/email normalises to the same mobile.
 *
 * Existing non-empty member-profile phone numbers are never overwritten.
 */
export async function syncTeamCaptainPhonesFromKnownContacts(
  teamId: string,
): Promise<CaptainPhoneSyncResult> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      contactEmail: true,
      contactPhone: true,
      secondaryContactEmail: true,
      secondaryContactPhone: true,
      convertedFromLead: {
        select: { email: true, phone: true },
      },
      members: {
        where: { role: TeamRole.CAPTAIN },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          user: { select: { email: true } },
        },
      },
    },
  });

  if (!team || team.members.length === 0) {
    return {
      updated: 0,
      matched: 0,
      conflicts: 0,
      profiles: new Map<string, TeamMemberProfile>(),
    };
  }

  const memberIds = team.members.map((member) => member.id);
  const existingProfiles = await getTeamMemberProfilesByTeamMemberIds(memberIds);
  const candidatesByEmail = new Map<string, Map<string, string>>();

  addKnownContact(candidatesByEmail, {
    email: team.contactEmail,
    phone: team.contactPhone,
  });
  addKnownContact(candidatesByEmail, {
    email: team.secondaryContactEmail,
    phone: team.secondaryContactPhone,
  });
  addKnownContact(candidatesByEmail, {
    email: team.convertedFromLead?.email ?? null,
    phone: team.convertedFromLead?.phone ?? null,
  });

  let updated = 0;
  let matched = 0;
  let conflicts = 0;

  for (const member of team.members) {
    const email = normaliseEmail(member.user.email);
    if (!email) continue;

    const candidates = candidatesByEmail.get(email);
    if (!candidates || candidates.size === 0) continue;

    if (candidates.size > 1) {
      conflicts += 1;
      continue;
    }

    matched += 1;

    const currentPhone = existingProfiles.get(member.id)?.phone?.trim() || null;
    if (currentPhone) continue;

    const phone = Array.from(candidates.values())[0] ?? null;
    if (!phone) continue;

    await prisma.$executeRaw`
      INSERT INTO "TeamMemberProfile" (
        "id",
        "teamMemberId",
        "phone",
        "createdAt",
        "updatedAt"
      )
      VALUES (${randomUUID()}, ${member.id}, ${phone}, NOW(), NOW())
      ON CONFLICT ("teamMemberId") DO UPDATE
      SET
        "phone" = EXCLUDED."phone",
        "updatedAt" = NOW()
      WHERE NULLIF(BTRIM("TeamMemberProfile"."phone"), '') IS NULL
    `;

    updated += 1;
  }

  const profiles = updated
    ? await getTeamMemberProfilesByTeamMemberIds(memberIds)
    : existingProfiles;

  return { updated, matched, conflicts, profiles };
}
