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
  replyTo: string;
  headers?: Record<string, string> | null;
};

export type NotificationProviderSendResult = {
  provider: "resend";
  providerMessageId: string | null;
  responsePayload?: Prisma.InputJsonValue;
  fromEmail: string;
};

const MIN_RESEND_SEND_INTERVAL_MS = 250;
const RATE_LIMIT_RETRY_DELAYS_MS = [500, 1000, 2000] as const;

let resendNextSendAtMs = 0;

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

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;

    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage.trim();
    }
  }

  return "Failed to send email with Resend.";
}

function isRateLimitError(error: unknown) {
  const message = getErrorMessage(error);

  if (
    error &&
    typeof error === "object" &&
    !Array.isArray(error)
  ) {
    const maybe = error as {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      name?: unknown;
    };

    if (maybe.status === 429 || maybe.statusCode === 429) {
      return true;
    }

    if (
      typeof maybe.code === "string" &&
      /rate.?limit/i.test(maybe.code)
    ) {
      return true;
    }

    if (
      typeof maybe.name === "string" &&
      /rate.?limit/i.test(maybe.name)
    ) {
      return true;
    }
  }

  return /too many requests|rate limit|only make \d+ requests per second|429/i.test(
    message,
  );
}

async function waitForResendSendWindow() {
  const now = Date.now();
  const scheduledAt = Math.max(now, resendNextSendAtMs);
  resendNextSendAtMs = scheduledAt + MIN_RESEND_SEND_INTERVAL_MS;

  const waitMs = scheduledAt - now;

  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

export async function sendEmailWithResend(
  input: SendNotificationEmailInput,
): Promise<NotificationProviderSendResult> {
  const resend = getResendClient();
  const fromEmail = getEmailFromAddress();
  const sanitizedHeaders = sanitizeHeaders(input.headers);
  const replyTo = input.replyTo.trim();

  if (!replyTo) {
    throw new Error("Notification email reply-to is missing.");
  }

  const payload = {
    from: fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
    replyTo,
    ...(sanitizedHeaders ? { headers: sanitizedHeaders } : {}),
  };

  let lastErrorMessage = "Failed to send email with Resend.";

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS_MS.length; attempt += 1) {
    await waitForResendSendWindow();

    try {
      const response = await resend.emails.send(payload);

      if (response.error) {
        lastErrorMessage = getErrorMessage(response.error);

        if (
          !isRateLimitError(response.error) ||
          attempt === RATE_LIMIT_RETRY_DELAYS_MS.length
        ) {
          throw new Error(lastErrorMessage);
        }

        await sleep(RATE_LIMIT_RETRY_DELAYS_MS[attempt]);
        continue;
      }

      const responsePayload: Prisma.InputJsonValue = {
        data: {
          id: response.data?.id ?? null,
        },
      };

      return {
        provider: "resend",
        providerMessageId: response.data?.id ?? null,
        responsePayload,
        fromEmail,
      };
    } catch (error) {
      lastErrorMessage = getErrorMessage(error);

      if (
        !isRateLimitError(error) ||
        attempt === RATE_LIMIT_RETRY_DELAYS_MS.length
      ) {
        throw new Error(lastErrorMessage);
      }

      await sleep(RATE_LIMIT_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error(lastErrorMessage);
}