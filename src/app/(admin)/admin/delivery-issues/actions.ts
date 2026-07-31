// ========================================
// File: src/app/(admin)/admin/delivery-issues/actions.ts
// ========================================

"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import {
  DeliveryIssueRepairError,
  repairDeliveryIssue,
} from "@/lib/notifications/delivery-issue-repair";
import {
  isValidEmailAddress,
  normalizeEmailAddress,
} from "@/lib/notifications/email-health";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const DELIVERY_ISSUES_PATH = "/admin/delivery-issues";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function buildRedirect(input: {
  notice?: string;
  error?: string;
  recipient?: string | null;
  sourceUpdated?: boolean;
}) {
  const params = new URLSearchParams();
  if (input.notice) params.set("notice", input.notice);
  if (input.error) params.set("error", input.error);
  if (input.recipient) params.set("recipient", input.recipient);
  if (input.sourceUpdated === false) params.set("sourceUpdated", "0");
  const query = params.toString();
  return `${DELIVERY_ISSUES_PATH}${query ? `?${query}` : ""}`;
}

function errorCode(error: unknown) {
  if (error instanceof DeliveryIssueRepairError) return error.code;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return "email_in_use";
  }
  console.error("Delivery issue correction failed", error);
  return "save_failed";
}

export async function resolveDeliveryIssueAction(formData: FormData) {
  const { user } = await requireAdmin();
  const recipientId = readString(formData, "recipientId");
  const email = normalizeEmailAddress(readString(formData, "email"));
  const confirmed = readBoolean(formData, "confirmValidAddress");

  if (!recipientId) redirect(buildRedirect({ error: "missing_recipient" }));
  if (!isValidEmailAddress(email)) {
    redirect(buildRedirect({ error: "invalid_email" }));
  }
  if (!confirmed) {
    redirect(buildRedirect({ error: "confirmation_required" }));
  }

  let result: Awaited<ReturnType<typeof repairDeliveryIssue>> | null = null;

  try {
    result = await repairDeliveryIssue({
      recipientId,
      newEmail: email,
      retryDispatchId: readString(formData, "retryDispatchId") || null,
      retryLatest: readBoolean(formData, "retryLatest"),
      confirmedResendRemoval: readBoolean(
        formData,
        "confirmedResendRemoval",
      ),
      resolvedByUserId: user?.id ?? null,
    });
  } catch (error) {
    redirect(buildRedirect({ error: errorCode(error) }));
  }

  if (!result) redirect(buildRedirect({ error: "save_failed" }));

  if (result.retryDispatchId) {
    try {
      const [dispatch, recipient] = await Promise.all([
        prisma.notificationDispatch.findUnique({
          where: { id: result.retryDispatchId },
        }),
        prisma.notificationRecipient.findUnique({
          where: { id: recipientId },
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            emailNormalized: true,
            phoneNormalized: true,
          },
        }),
      ]);
      if (dispatch && recipient) {
        await logNotificationDispatchToThread({ dispatch, recipient });
      }
    } catch (error) {
      console.error(
        "Delivery issue retry was queued but could not be logged",
        error,
      );
    }
  }

  for (const path of [
    DELIVERY_ISSUES_PATH,
    "/admin/queue",
    "/admin/messaging",
    "/admin/teams",
    "/admin/leads",
    "/admin/player-prospects",
    "/admin/referees",
    "/admin/users",
  ]) {
    revalidatePath(path);
  }

  redirect(
    buildRedirect({
      notice: result.retryDispatchId ? "resolved_and_retried" : "resolved",
      recipient: result.recipientName,
      sourceUpdated: result.sourceUpdated,
    }),
  );
}
