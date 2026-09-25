"use server";

import { PortalConversationType, PortalMessageSenderRole, TeamRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { queuePushNotifications } from "@/lib/push-notifications";
import { requireAdmin } from "@/lib/requireAdmin";

function previewText(body: string) {
  const compact = body.trim().replace(/\s+/g, " ");
  return compact.length <= 120 ? compact : `${compact.slice(0, 117)}...`;
}

export async function sendAdminSixflChatReplyAction(
  conversationId: string,
  formData: FormData,
) {
  const { user } = await requireAdmin();
  const body = String(formData.get("message") ?? "").trim();

  if (!body) return;
  if (body.length > 2000) {
    throw new Error("Please keep replies under 2,000 characters.");
  }

  const conversation = await prisma.portalConversation.findFirst({
    where: {
      id: conversationId,
      type: PortalConversationType.SIXFL,
    },
    select: {
      id: true,
      teamId: true,
      participantUserId: true,
      team: { select: { name: true } },
    },
  });

  if (!conversation?.participantUserId) {
    throw new Error("This SIXFL conversation could not be found.");
  }

  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.portalMessage.create({
      data: {
        conversationId: conversation.id,
        senderUserId: user?.id ?? null,
        senderRole: PortalMessageSenderRole.ADMIN,
        body,
        isAdminTest: false,
      },
      select: { id: true },
    });

    await tx.portalConversation.update({
      where: { id: conversation.id },
      data: {
        latestMessageAt: now,
        lastMessagePreview: previewText(body),
      },
    });

    return created;
  });

  const membership = await prisma.teamMember.findFirst({
    where: {
      teamId: conversation.teamId,
      userId: conversation.participantUserId,
    },
    select: { role: true },
  });

  const isCaptain = membership?.role === TeamRole.CAPTAIN;
  await queuePushNotifications([
    {
      userId: conversation.participantUserId,
      title: `${conversation.team.name} · SIXFL reply`,
      body: previewText(body),
      url: isCaptain
        ? `/captain/team/${conversation.teamId}/chat?conversation=sixfl`
        : `/player/team/${conversation.teamId}/chat?conversation=sixfl`,
      tag: `sixfl-support-${conversation.id}`,
      sourceType: "PORTAL_SIXFL_REPLY",
      sourceId: message.id,
    },
  ]).catch((error) => {
    console.warn("SIXFL support reply saved but push notification failed", {
      conversationId,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  revalidatePath("/admin/messaging");
  revalidatePath("/admin/chat");
  revalidatePath(`/admin/chat/support/${conversationId}`);
  revalidatePath("/admin", "layout");
}
