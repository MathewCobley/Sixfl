// ========================================
// File: src/app/captain/team/[teamid]/squad/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  TeamRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { queueDirectNotification } from "@/lib/notifications/service";

const ALLOWED_ROLES: TeamRole[] = [
  "CAPTAIN",
  "MANAGER",
  "PLAYER",
  "COACH",
];

function getRoleValue(input: FormDataEntryValue | null): TeamRole {
  const value = String(input ?? "").trim().toUpperCase();

  if (ALLOWED_ROLES.includes(value as TeamRole)) {
    return value as TeamRole;
  }

  return "PLAYER";
}

function getErrorRedirect(teamid: string, message: string) {
  return `/captain/team/${teamid}/squad?error=${encodeURIComponent(message)}`;
}

function getSuccessRedirect(teamid: string, saved = "1") {
  return `/captain/team/${teamid}/squad?saved=${encodeURIComponent(saved)}`;
}

function getNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function personaliseSquadText(
  text: string,
  input: {
    firstName: string;
    fullName: string;
    teamName: string;
  },
) {
  return text
    .replace(/{{firstName}}/gi, input.firstName || "there")
    .replace(/{{name}}/gi, input.fullName || input.firstName || "there")
    .replace(/{{fullName}}/gi, input.fullName || input.firstName || "there")
    .replace(/{{teamName}}/gi, input.teamName)
    .replace(/Hi there/gi, `Hi ${input.firstName || "there"}`);
}

async function ensureSquadUserNotificationRecipient(input: {
  userId: string;
  email: string;
  displayName: string | null;
  teamId: string;
  teamName: string;
}) {
  const email = input.email.trim().toLowerCase();

  const recipient = await prisma.notificationRecipient.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: NotificationRecipientSourceType.USER,
        sourceId: input.userId,
      },
    },
    update: {
      audience: NotificationAudience.USER,
      displayName: input.displayName,
      email,
      emailNormalized: email,
      transactionalEmailOptIn: true,
      marketingEmailOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        userId: input.userId,
      },
      lastSyncedAt: new Date(),
    },
    create: {
      sourceType: NotificationRecipientSourceType.USER,
      sourceId: input.userId,
      audience: NotificationAudience.USER,
      displayName: input.displayName,
      email,
      emailNormalized: email,
      transactionalEmailOptIn: true,
      marketingEmailOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        userId: input.userId,
      },
      lastSyncedAt: new Date(),
    },
  });

  await prisma.notificationPreference.upsert({
    where: { recipientId: recipient.id },
    update: {
      emailEnabled: true,
      marketingEmailEnabled: true,
    },
    create: {
      recipientId: recipient.id,
      emailEnabled: true,
      marketingEmailEnabled: true,
    },
  });

  return recipient;
}

export async function addSquadMemberAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = getRoleValue(formData.get("role"));

  await requireCaptain(teamid);

  if (!teamid) {
    redirect("/captain");
  }

  if (!email) {
    redirect(getErrorRedirect(teamid, "Enter an email address."));
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (!user) {
    redirect(
      getErrorRedirect(
        teamid,
        "No user exists with that email yet. Ask them to sign in or register first.",
      ),
    );
  }

  const existingMember = await prisma.teamMember.findUnique({
    where: {
      userId_teamId: {
        userId: user.id,
        teamId: teamid,
      },
    },
    select: { id: true },
  });

  if (existingMember) {
    redirect(getErrorRedirect(teamid, "That user is already in this team squad."));
  }

  await prisma.teamMember.create({
    data: {
      teamId: teamid,
      userId: user.id,
      role,
    },
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  redirect(getSuccessRedirect(teamid, "member-added"));
}

export async function updateSquadMemberRoleAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const role = getRoleValue(formData.get("role"));

  await requireCaptain(teamid);

  if (!teamid || !membershipId) {
    redirect("/captain");
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId: teamid,
    },
    select: {
      id: true,
      userId: true,
      role: true,
      team: {
        select: {
          captainUserId: true,
        },
      },
    },
  });

  if (!membership) {
    redirect(getErrorRedirect(teamid, "Squad member not found."));
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMember.update({
      where: { id: membershipId },
      data: { role },
    });

    if (role === "CAPTAIN") {
      await tx.team.update({
        where: { id: teamid },
        data: {
          captainUserId: membership.userId,
          captainLinkedAt: new Date(),
          captainLinkedSource: "captain-squad-page",
        },
      });
    } else if (
      membership.role === "CAPTAIN" &&
      membership.team.captainUserId === membership.userId
    ) {
      await tx.team.update({
        where: { id: teamid },
        data: {
          captainUserId: null,
        },
      });
    }
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  redirect(getSuccessRedirect(teamid, "role-updated"));
}

export async function removeSquadMemberAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();

  await requireCaptain(teamid);

  if (!teamid || !membershipId) {
    redirect("/captain");
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId: teamid,
    },
    select: {
      id: true,
      userId: true,
      role: true,
      team: {
        select: {
          captainUserId: true,
        },
      },
    },
  });

  if (!membership) {
    redirect(getErrorRedirect(teamid, "Squad member not found."));
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMember.delete({
      where: { id: membershipId },
    });

    if (membership.team.captainUserId === membership.userId) {
      await tx.team.update({
        where: { id: teamid },
        data: {
          captainUserId: null,
        },
      });
    }
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  redirect(getSuccessRedirect(teamid, "member-removed"));
}

export async function sendSquadEmailAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const selectedMemberIds = formData
    .getAll("memberIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const templateId = getNullableString(formData.get("templateId"));
  const templateKey = getNullableString(formData.get("templateKey"));

  const { user } = await requireCaptain(teamid);

  if (!teamid) {
    redirect("/captain");
  }

  if (!subject) {
    redirect(getErrorRedirect(teamid, "Email subject is required."));
  }

  if (!body) {
    redirect(getErrorRedirect(teamid, "Email body is required."));
  }

  if (selectedMemberIds.length === 0) {
    redirect(getErrorRedirect(teamid, "Select at least one squad member."));
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      members: {
        where: {
          id: { in: selectedMemberIds },
        },
        select: {
          id: true,
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
    redirect(getErrorRedirect(teamid, "Team not found."));
  }

  const recipients = team.members.filter((member) => Boolean(member.user.email?.trim()));

  if (recipients.length === 0) {
    redirect(getErrorRedirect(teamid, "None of the selected squad members have an email address."));
  }

  for (const member of recipients) {
    const email = member.user.email?.trim().toLowerCase();
    if (!email) continue;

    const firstName = (member.user.name || "").trim().split(/\s+/).filter(Boolean)[0] || "there";
    const fullName = member.user.name?.trim() || firstName;
    const personalisedSubject = personaliseSquadText(subject, {
      firstName,
      fullName,
      teamName: team.name,
    });
    const personalisedBody = personaliseSquadText(body, {
      firstName,
      fullName,
      teamName: team.name,
    });

    const recipient = await ensureSquadUserNotificationRecipient({
      userId: member.user.id,
      email,
      displayName: member.user.name?.trim() || null,
      teamId: teamid,
      teamName: team.name,
    });

    await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.USER,
      subject: personalisedSubject,
      body: personalisedBody,
      isTransactional: false,
      sourceType: "TEAM",
      sourceId: teamid,
      metadata: {
        origin: "captain_squad_email",
        originLabel: "Sent to squad from captain hub",
        teamId: teamid,
        membershipId: member.id,
        userId: member.user.id,
        templateId,
        templateKey,
      },
      createdByUserId: user?.id ?? null,
    });
  }

  revalidatePath(`/captain/team/${teamid}/squad`);
  redirect(getSuccessRedirect(teamid, `squad-email-sent`));
}
