// ========================================
// File: src/lib/notifications/providers/resend.ts
// ========================================

import type { Prisma } from "@prisma/client";
import { getEmailFromAddress, getResendClient } from "@/lib/resend/client";

export type SendNotificationEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  replyTo?: string | null;
  headers?: Record<string, string> | null;
};

export type NotificationProviderSendResult = {
  provider: "resend";
  providerMessageId: string | null;
  responsePayload?: Prisma.InputJsonValue;
  fromEmail: string;
};

function sanitizeHeaders(
  input: Record<string, string> | null | undefined,
): Record<string, string> | undefined {
  if (!input) return undefined;

  const entries = Object.entries(input)
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([key, value]) => key && value);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

export async function sendEmailWithResend(
  input: SendNotificationEmailInput,
): Promise<NotificationProviderSendResult> {
  const resend = getResendClient();
  const fromEmail = getEmailFromAddress();
  const sanitizedHeaders = sanitizeHeaders(input.headers);

  const response = await resend.emails.send({
    from: fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(sanitizedHeaders ? { headers: sanitizedHeaders } : {}),
  });

  if (response.error) {
    throw new Error(response.error.message || "Failed to send email with Resend.");
  }

  const responsePayload: Prisma.InputJsonValue = {
    data: {
      id: response.data?.id ?? null,
    },
    error: response.error
      ? {
          message: response.error.message ?? null,
        }
      : null,
  };

  return {
    provider: "resend",
    providerMessageId: response.data?.id ?? null,
    responsePayload,
    fromEmail,
  };
}
