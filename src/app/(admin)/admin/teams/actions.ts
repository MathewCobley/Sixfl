// ========================================
// File: src/app/(admin)/admin/teams/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  TeamRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";

function generateClaimCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

async function generateUniqueClaimCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateClaimCode();
    const existing = await prisma.team.findUnique({
      where: { claimCode: code },
      select: { id: true },
    });

    if (!existing) return code;
  }

  throw new Error("Failed to generate unique claim code.");
}

function parseLatestKickoffTime(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  if (!/^\d{2}:\d{2}$/.test(raw)) {
    throw new Error("Latest kickoff time must be in HH:MM format.");
  }

  const [hours, minutes] = raw.split(":").map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error("Latest kickoff time is invalid.");
  }

  return raw;
}

function getSafeRedirectPath(value: FormDataEntryValue | null, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function getTrimmedValue(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function createTeamAction(formData: FormData) {
  await requireAdmin();

  const name = getTrimmedValue(formData.get("name"));
  const leagueIdRaw = getTrimmedValue(formData.get("leagueId"));
  const logoUrlRaw = getTrimmedValue(formData.get("logoUrl"));
  const latestKickoffTime = parseLatestKickoffTime(
    formData.get("latestKickoffTime"),
  );

  const contactName = getTrimmedValue(formData.get("contactName")) || null;
  const contactEmail = getTrimmedValue(formData.get("contactEmail")) || null;
  const contactPhone = getTrimmedValue(formData.get("contactPhone")) || null;
  const secondaryContactName =
    getTrimmedValue(formData.get("secondaryContactName")) || null;
  const secondaryContactEmail =
    getTrimmedValue(formData.get("secondaryContactEmail")) || null;
  const secondaryContactPhone =
    getTrimmedValue(formData.get("secondaryContactPhone")) || null;

  const leagueId = leagueIdRaw || null;
  const logoUrl = logoUrlRaw || null;

  if (!name) {
    redirect("/admin/teams/new");
  }

  const claimCode = await generateUniqueClaimCode();

  const team = await prisma.team.create({
    data: {
      name,
      claimCode,
      leagueId,
      logoUrl,
      latestKickoffTime,
      contactName,
      contactEmail,
      contactPhone,
      secondaryContactName,
      secondaryContactEmail,
      secondaryContactPhone,
    },
  });

  await upsertTeamNotificationRecipient(team.id);

  revalidatePath("/admin/teams");
  if (leagueId) {
    revalidatePath(`/admin/leagues/${leagueId}`);
  }

  redirect("/admin/teams");
}

export async function updateTeamDetailsAction(formData: FormData) {
  await requireAdmin();

  const id = getTrimmedValue(formData.get("id"));
  const leagueIdRaw = getTrimmedValue(formData.get("leagueId"));
  const logoUrlRaw = getTrimmedValue(formData.get("logoUrl"));
  const latestKickoffTime = parseLatestKickoffTime(
    formData.get("latestKickoffTime"),
  );

  const contactName = getTrimmedValue(formData.get("contactName")) || null;
  const contactEmail = getTrimmedValue(formData.get("contactEmail")) || null;
  const contactPhone = getTrimmedValue(formData.get("contactPhone")) || null;
  const secondaryContactName =
    getTrimmedValue(formData.get("secondaryContactName")) || null;
  const secondaryContactEmail =
    getTrimmedValue(formData.get("secondaryContactEmail")) || null;
  const secondaryContactPhone =
    getTrimmedValue(formData.get("secondaryContactPhone")) || null;

  if (!id) {
    redirect("/admin/teams?error=missing_id");
  }

  const leagueId = leagueIdRaw || null;
  const logoUrl = logoUrlRaw || null;

  await prisma.team.update({
    where: { id },
    data: {
      leagueId,
      logoUrl,
      latestKickoffTime,
      contactName,
      contactEmail,
      contactPhone,
      secondaryContactName,
      secondaryContactEmail,
      secondaryContactPhone,
    },
  });

  await upsertTeamNotificationRecipient(id);

  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${id}`);
  if (leagueId) {
    revalidatePath(`/admin/leagues/${leagueId}`);
  }

  redirect(`/admin/teams/${id}?saved=1`);
}

export async function sendTeamMessageAction(formData: FormData) {
  const { user } = await requireAdmin();

  const teamId = getTrimmedValue(formData.get("teamId"));
  const channelInput = getTrimmedValue(formData.get("channel")).toUpperCase();
  const from = getSafeRedirectPath(
    formData.get("from"),
    `/admin/teams/${teamId}`,
  );
  const subject = getTrimmedValue(formData.get("subject"));
  const body = getTrimmedValue(formData.get("body"));

  if (!teamId) {
    redirect("/admin/teams?error=missing_id");
  }

  if (!body) {
    redirect(`${from}?composeError=missing_body`);
  }

  const channel =
    channelInput === "SMS"
      ? NotificationChannel.SMS
      : NotificationChannel.EMAIL;

  if (channel === NotificationChannel.EMAIL && !subject) {
    redirect(`${from}?composeError=missing_subject`);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      leagueId: true,
    },
  });

  if (!team) {
    redirect("/admin/teams?error=missing_id");
  }

  const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);

  if (channel === NotificationChannel.EMAIL && !recipient.email?.trim()) {
    redirect(`${from}?composeError=missing_email`);
  }

  if (channel === NotificationChannel.SMS && !recipient.phone?.trim()) {
    redirect(`${from}?composeError=missing_phone`);
  }

  await queueDirectNotification({
    recipientId: recipient.id,
    channel,
    audience: NotificationAudience.TEAM,
    subject: channel === NotificationChannel.EMAIL ? subject : null,
    body,
    isTransactional: true,
    sourceType: "TEAM",
    sourceId: teamId,
    metadata: {
      origin: "team_admin",
      originLabel: "Sent from team page",
      teamId,
      teamName: snapshot.teamName,
      leagueId: snapshot.leagueId,
      leagueName: snapshot.leagueName,
    },
    createdByUserId: user?.id ?? null,
  });

  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath("/admin/teams");
  if (team.leagueId) {
    revalidatePath(`/admin/leagues/${team.leagueId}`);
  }

  redirect(`${from}?messageQueued=1&channel=${channel.toLowerCase()}`);
}

export async function regenerateClaimCodeAction(formData: FormData) {
  await requireAdmin();

  const id = getTrimmedValue(formData.get("id"));
  const from = getSafeRedirectPath(formData.get("from"), "/admin/teams");

  if (!id) {
    redirect(`${from}?error=missing_id`);
  }

  const newClaimCode = await generateUniqueClaimCode();

  await prisma.$transaction([
    prisma.teamMember.deleteMany({
      where: {
        teamId: id,
        role: TeamRole.MANAGER,
      },
    }),
    prisma.team.update({
      where: { id },
      data: {
        claimCode: newClaimCode,
      },
    }),
  ]);

  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${id}`);

  redirect(`${from}?regenerated=1`);
}

export async function deleteTeamAction(formData: FormData) {
  await requireAdmin();

  const id = getTrimmedValue(formData.get("id"));
  const from = getSafeRedirectPath(formData.get("from"), "/admin/teams");

  if (!id) {
    redirect(`${from}?error=missing_id`);
  }

  const fixtureCount = await prisma.fixture.count({
    where: {
      OR: [{ homeTeamId: id }, { awayTeamId: id }],
    },
  });

  if (fixtureCount > 0) {
    redirect(`${from}?error=has_fixtures`);
  }

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      leagueId: true,
    },
  });

  await prisma.team.delete({
    where: { id },
  });

  revalidatePath("/admin/teams");
  if (team?.leagueId) {
    revalidatePath(`/admin/leagues/${team.leagueId}`);
  }

  redirect(`${from}?deleted=1`);
}
