// ========================================
// File: src/lib/notifications/providers/twilio.ts
// ========================================

import twilio from "twilio";
import type { Prisma } from "@prisma/client";

export type SendSmsWithTwilioInput = {
  to: string;
  body: string;
  mediaUrl?: string[];
};

export type SendSmsWithTwilioResult = {
  provider: "twilio";
  providerMessageId: string;
  responsePayload: Prisma.InputJsonValue;
  fromNumber: string | null;
  messagingServiceSid: string | null;
};

type TwilioClient = ReturnType<typeof twilio>;

let cachedClient: TwilioClient | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function getTwilioClient(): TwilioClient {
  if (cachedClient) {
    return cachedClient;
  }

  const accountSid = getRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = getRequiredEnv("TWILIO_AUTH_TOKEN");

  cachedClient = twilio(accountSid, authToken);
  return cachedClient;
}

function buildMessageCreateInput(input: SendSmsWithTwilioInput) {
  const messagingServiceSid = getOptionalEnv("TWILIO_MESSAGING_SERVICE_SID");
  const fromNumber = getOptionalEnv("TWILIO_PHONE_NUMBER");

  if (!messagingServiceSid && !fromNumber) {
    throw new Error(
      "Twilio SMS sending requires either TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER.",
    );
  }

  const payload: {
    to: string;
    body: string;
    messagingServiceSid?: string;
    from?: string;
    mediaUrl?: string[];
  } = {
    to: input.to,
    body: input.body,
  };

  if (messagingServiceSid) {
    payload.messagingServiceSid = messagingServiceSid;
  } else if (fromNumber) {
    payload.from = fromNumber;
  }

  if (input.mediaUrl?.length) {
    payload.mediaUrl = input.mediaUrl;
  }

  return {
    payload,
    configuredFromNumber: fromNumber,
    configuredMessagingServiceSid: messagingServiceSid,
  };
}

function sanitizeTwilioResponse(
  message: Awaited<ReturnType<TwilioClient["messages"]["create"]>>,
): Prisma.InputJsonValue {
  return {
    sid: message.sid,
    accountSid: message.accountSid,
    messagingServiceSid: message.messagingServiceSid ?? null,
    from: message.from ?? null,
    to: message.to ?? null,
    status: message.status ?? null,
    errorCode: message.errorCode ?? null,
    errorMessage: message.errorMessage ?? null,
    direction: message.direction ?? null,
    price: message.price ?? null,
    priceUnit: message.priceUnit ?? null,
    uri: message.uri ?? null,
    dateCreated: message.dateCreated?.toISOString?.() ?? null,
    dateSent: message.dateSent?.toISOString?.() ?? null,
    dateUpdated: message.dateUpdated?.toISOString?.() ?? null,
  } as Prisma.InputJsonValue;
}

export async function sendSmsWithTwilio(
  input: SendSmsWithTwilioInput,
): Promise<SendSmsWithTwilioResult> {
  const client = getTwilioClient();
  const { payload, configuredFromNumber, configuredMessagingServiceSid } =
    buildMessageCreateInput(input);

  const message = await client.messages.create(payload);

  return {
    provider: "twilio",
    providerMessageId: message.sid,
    fromNumber: message.from ?? configuredFromNumber ?? null,
    messagingServiceSid:
      message.messagingServiceSid ?? configuredMessagingServiceSid ?? null,
    responsePayload: sanitizeTwilioResponse(message),
  };
}