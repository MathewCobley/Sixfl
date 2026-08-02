"use server";

import {
  NotificationChannel,
  NotificationDispatchStatus,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, Prisma.JsonValue>;
  }

  return value as Record<string, Prisma.JsonValue>;
}

export async function resolveEmailDeliveryIssueAction(formData: FormData) {
  const access = await requireAdmin();
  const recipientId = String(formData.get("recipientId") ?? "").trim();

  if (!recipientId) {
    redirect("/admin/delivery-issues?error=missing_recipient");
  }

  const recipient = await prisma.notificationRecipient.findUnique({
    where: { id: recipientId },
    select: {
      id: true,
      metadata: true,
    },
  });

  if (!recipient) {
    redirect("/admin/delivery-issues?error=recipient_not_found");
  }

  const resolvedAt = new Date();
  const metadata = {
    ...jsonObject(recipient.metadata),
    emailDeliveryIssueResolvedAt: resolvedAt.toISOString(),
    emailDeliveryIssueResolvedByUserId: access.user?.id ?? null,
    emailDeliveryIssueResolvedByEmail: access.user?.email ?? null,
  };

  await prisma.$transaction([
    prisma.notificationRecipient.update({
      where: { id: recipient.id },
      data: {
        isSuppressed: false,
        suppressionReason: null,
        metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue,
      },
    }),
    prisma.notificationDispatch.updateMany({
      where: {
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        status: NotificationDispatchStatus.FAILED,
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: resolvedAt,
      },
    }),
  ]);

  revalidatePath("/admin");
  revalidatePath("/admin/delivery-issues");
  redirect("/admin/delivery-issues?resolved=1");
}
