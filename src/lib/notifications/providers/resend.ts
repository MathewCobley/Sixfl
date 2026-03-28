// ========================================
// File: src/lib/notifications/providers/resend.ts
// ========================================

import { Resend } from "resend";
import type { Prisma } from "@prisma/client";

export type SendNotificationEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
};

export type NotificationProviderSendResult = {
  provider: string;
  providerMessageId: string | null;
  responsePayload?: Prisma.InputJsonValue;
};

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing.");
  }

  return new Resend(apiKey);
}

function getEmailFromAddress() {
  const value = process.env.EMAIL_FROM?.trim();

  if (!value) {
    throw new Error("EMAIL_FROM is missing.");
  }

  return value;
}

export async function sendEmailWithResend(
  input: SendNotificationEmailInput,
): Promise<NotificationProviderSendResult> {
  const resend = getResendClient();

  const response = await resend.emails.send({
    from: getEmailFromAddress(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
  });

  return {
    provider: "resend",
    providerMessageId: response.data?.id ?? null,
    responsePayload: response as Prisma.InputJsonValue,
  };
}
