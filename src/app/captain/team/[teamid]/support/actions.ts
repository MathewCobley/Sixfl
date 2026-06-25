// ========================================
// File: src/app/captain/team/[teamid]/support/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

function cleanText(value: FormDataEntryValue | null, fallback = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function cleanMessage(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function getSafeReturnPath(teamId: string, value: FormDataEntryValue | null) {
  const rawPath = String(value ?? "").trim();
  const prefix = `/captain/team/${teamId}`;

  if (rawPath === prefix || rawPath.startsWith(`${prefix}/`)) {
    return rawPath;
  }

  return prefix;
}

function withSupportSent(path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}support=sent`;
}

function buildPreview(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 140) return cleaned;
  return `${cleaned.slice(0, 137)}...`;
}

export async function sendCaptainSupportRequestAction(formData: FormData) {
  const teamId = cleanText(formData.get("teamId"));

  if (!teamId) {
    redirect("/captain");
  }

  const access = await requireCaptain(teamId);
  const returnPath = getSafeReturnPath(teamId, formData.get("pagePath"));
  const topic = cleanText(formData.get("topic"), "General help");
  const quickOption = cleanText(formData.get("quickOption"), "Not selected");
  const message = cleanMessage(formData.get("message"));

  if (!message) {
    redirect(`${returnPath}${returnPath.includes("?") ? "&" : "?"}support=missing-message`);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      leagueId: true,
      league: { select: { name: true, season: true } },
    },
  });

  if (!team) {
    redirect("/captain");
  }

  const captainName = access.user?.name?.trim() || access.user?.email?.trim() || "Captain";
  const captainEmail = access.user?.email?.trim().toLowerCase() || null;
  const now = new Date();
  const subject = `Captain help request: ${team.name} - ${topic}`;
  const body = [
    `Captain help request`,
    ``,
    `Team: ${team.name}`,
    team.league ? `League: ${team.league.name}${team.league.season ? ` - ${team.league.season}` : ""}` : null,
    `Captain: ${captainName}`,
    captainEmail ? `Email: ${captainEmail}` : null,
    `Page: ${returnPath}`,
    `Topic: ${topic}`,
    `Selected option: ${quickOption}`,
    ``,
    `Message:`,
    message,
  ]
    .filter(Boolean)
    .join("\n");

  const thread = await prisma.messageThread.create({
    data: {
      channel: "EMAIL",
      status: "OPEN",
      teamId: team.id,
      leagueId: team.leagueId,
      sourceType: "CAPTAIN_SUPPORT",
      sourceId: team.id,
      contactName: captainName,
      contactEmail: captainEmail,
      emailNormalized: captainEmail,
      latestMessageAt: now,
      latestInboundAt: now,
      lastMessagePreview: buildPreview(message),
      unreadForAdminCount: 1,
    },
  });

  const entry = await prisma.messageEntry.create({
    data: {
      threadId: thread.id,
      channel: "EMAIL",
      direction: "INBOUND",
      participantRole: "CAPTAIN",
      subject,
      body,
      textBody: body,
      fromEmail: captainEmail,
      receivedAt: now,
      createdByUserId: access.user?.id ?? null,
    },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: {
      lastInboundMessageId: entry.id,
    },
  });

  await prisma.inboxAlert.create({
    data: {
      threadId: thread.id,
      messageId: entry.id,
      type: "CAPTAIN_SUPPORT_REQUEST",
      status: "PENDING",
    },
  });

  revalidatePath("/admin/messages");
  revalidatePath(returnPath);
  redirect(withSupportSent(returnPath));
}
