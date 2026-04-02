// ========================================
// File: src/lib/resend/client.ts
// ========================================

import { Resend } from "resend";

let cachedResendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (cachedResendClient) {
    return cachedResendClient;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing.");
  }

  cachedResendClient = new Resend(apiKey);

  return cachedResendClient;
}

export function getEmailFromAddress(): string {
  const value = process.env.EMAIL_FROM?.trim();

  if (!value) {
    throw new Error("EMAIL_FROM is missing.");
  }

  return value;
}

export function getEmailReplyDomain(): string {
  const value = process.env.EMAIL_REPLY_DOMAIN?.trim().toLowerCase();

  if (!value) {
    throw new Error("EMAIL_REPLY_DOMAIN is missing.");
  }

  return value;
}