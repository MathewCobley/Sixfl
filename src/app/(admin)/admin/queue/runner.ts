// ========================================
// File: src/app/(admin)/admin/queue/runner.ts
// ========================================

"use server";

import { redirect } from "next/navigation";

import { processNotificationQueue } from "@/lib/notifications/processor";
import { requireAdmin } from "@/lib/requireAdmin";

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
