// ========================================
// File: src/lib/leads/responseLinks.ts
// ========================================

import { createHmac, timingSafeEqual } from "crypto";

export type LeadResponseAction = "yes" | "no";

export type ParsedLeadResponseToken = {
  leadId: string;
  action: LeadResponseAction;
};

type LeadResponsePayload = ParsedLeadResponseToken & {
  v: 1;
};

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function getLeadResponseSecret() {
  return (
    process.env.LEAD_RESPONSE_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    "sixfl-lead-response-development-secret"
  );
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), "=");

  return Buffer.from(padded, "base64").toString("utf8");
}

function signPayload(payload: string) {
  return toBase64Url(createHmac("sha256", getLeadResponseSecret()).update(payload).digest());
}

function isLeadResponseAction(value: unknown): value is LeadResponseAction {
  return value === "yes" || value === "no";
}

export function createLeadResponseToken(input: ParsedLeadResponseToken) {
  const payload: LeadResponsePayload = {
    v: 1,
    leadId: input.leadId,
    action: input.action,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function parseLeadResponseToken(token: string): ParsedLeadResponseToken | null {
  const [payload, signature, ...extraParts] = token.trim().split(".");

  if (!payload || !signature || extraParts.length > 0) {
    return null;
  }

  const expectedSignature = signPayload(payload);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as Partial<LeadResponsePayload>;

    if (parsed.v !== 1 || typeof parsed.leadId !== "string" || !isLeadResponseAction(parsed.action)) {
      return null;
    }

    return {
      leadId: parsed.leadId,
      action: parsed.action,
    };
  } catch {
    return null;
  }
}

export function buildLeadResponseUrls(leadId: string) {
  const baseUrl = getSiteUrl();

  return {
    yesResponseUrl: `${baseUrl}/lead-response/${createLeadResponseToken({
      leadId,
      action: "yes",
    })}`,
    noResponseUrl: `${baseUrl}/lead-response/${createLeadResponseToken({
      leadId,
      action: "no",
    })}`,
  };
}
