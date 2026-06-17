// ========================================
// File: src/app/(admin)/admin/queue/runner.ts
// ========================================

"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { requireAdmin } from "@/lib/requireAdmin";

function normalisePageValue(value: FormDataEntryValue | null) {
  const page = Number(String(value ?? "1"));
  return Number.isInteger(page) && page > 1 ? String(page) : null;
}

export async function runQueueFromAdmin() {
  await requireAdmin();

  const result = await processNotificationQueue(50);

  const params = new URLSearchParams();
  params.set("ran", "1");
  params.set("processed", String(result.processed));
  params.set("sent", String(result.sent));
  params.set("failed", String(result.failed));
  params.set("skipped", String(result.skipped));

  const firstProblem = result.items.find((item) => item.status !== "sent" && item.message);
  if (firstProblem?.message) params.set("message", firstProblem.message.slice(0, 220));

  redirect(`/admin/queue?${params.toString()}`);
}

export async function cancelQueuedDispatchFromAdmin(formData: FormData) {
  await requireAdmin();

  const dispatchId = String(formData.get("dispatchId") ?? "");
  const filter = String(formData.get("filter") ?? "queued");
  const page = normalisePageValue(formData.get("page"));

  const params = new URLSearchParams();
  params.set("filter", filter);
  if (page) params.set("page", page);

  if (!dispatchId) {
    params.set("queueMessage", "No dispatch was selected.");
    redirect(`/admin/queue?${params.toString()}`);
  }

  const result = await prisma.notificationDispatch.updateMany({
    where: {
      id: dispatchId,
      status: "QUEUED",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      failureReason: "Cancelled by admin before sending.",
    },
  });

  if (result.count === 0) {
    params.set(
      "queueMessage",
      "That item could not be cancelled. It may already have been sent, cancelled, or started processing.",
    );
    redirect(`/admin/queue?${params.toString()}`);
  }

  params.set("cancelled", "1");
  params.set("queueMessage", "Queued dispatch cancelled before sending.");

  redirect(`/admin/queue?${params.toString()}`);
}
