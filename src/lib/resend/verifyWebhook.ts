// ========================================
// File: src/lib/resend/verifyWebhook.ts
// ========================================

import { getResendClient } from "@/lib/resend/client";

export type ResendWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

export type ResendWebhookEvent = {
  type?: string;
  created_at?: string;
  data?: Record<string, unknown>;
} & Record<string, unknown>;

function getResendWebhookSecret(): string {
  const value = process.env.RESEND_WEBHOOK_SECRET?.trim();

  if (!value) {
    throw new Error("RESEND_WEBHOOK_SECRET is missing.");
  }

  return value;
}

export function getResendWebhookHeaders(
  request: Request,
): ResendWebhookHeaders | null {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    return null;
  }

  return {
    id,
    timestamp,
    signature,
  };
}

export function requireResendWebhookHeaders(
  request: Request,
): ResendWebhookHeaders {
  const headers = getResendWebhookHeaders(request);

  if (!headers) {
    throw new Error("Missing Resend webhook headers.");
  }

  return headers;
}

export function getResendWebhookDeliveryId(
  request: Request,
): string | null {
  return request.headers.get("svix-id");
}

export function verifyResendWebhookPayload(
  payload: string,
  headers: ResendWebhookHeaders,
): ResendWebhookEvent {
  const resend = getResendClient();

  const result = resend.webhooks.verify({
    payload,
    headers: {
      id: headers.id,
      timestamp: headers.timestamp,
      signature: headers.signature,
    },
    webhookSecret: getResendWebhookSecret(),
  });

  return result as ResendWebhookEvent;
}

export async function verifyResendWebhookRequest(request: Request): Promise<{
  payload: string;
  headers: ResendWebhookHeaders;
  event: ResendWebhookEvent;
}> {
  const payload = await request.text();
  const headers = requireResendWebhookHeaders(request);
  const event = verifyResendWebhookPayload(payload, headers);

  return {
    payload,
    headers,
    event,
  };
}