// ========================================
// File: src/lib/notifications/providers/twilio.ts
// ========================================

import type { Prisma } from "@prisma/client";

export type SendNotificationSmsInput = {
  to: string;
  body: string;
};

export type NotificationProviderSendResult = {
  provider: string;
  providerMessageId: string | null;
  responsePayload?: Prisma.InputJsonValue;
};

function getTwilioCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim();

  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID is missing.");
  }

  if (!authToken) {
    throw new Error("TWILIO_AUTH_TOKEN is missing.");
  }

  if (!messagingServiceSid && !fromNumber) {
    throw new Error(
      "Either TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER must be set.",
    );
  }

  return {
    accountSid,
    authToken,
    messagingServiceSid,
    fromNumber,
  };
}

export async function sendSmsWithTwilio(
  input: SendNotificationSmsInput,
): Promise<NotificationProviderSendResult> {
  const credentials = getTwilioCredentials();

  const body = new URLSearchParams({
    To: input.to,
    Body: input.body,
    ...(credentials.messagingServiceSid
      ? { MessagingServiceSid: credentials.messagingServiceSid }
      : { From: credentials.fromNumber! }),
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${credentials.accountSid}:${credentials.authToken}`,
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : "Twilio SMS send failed.";

    throw new Error(message);
  }

  return {
    provider: "twilio",
    providerMessageId:
      typeof payload.sid === "string" ? payload.sid : null,
    responsePayload: payload as Prisma.InputJsonValue,
  };
}