// ========================================
// File: src/lib/twilio/validateTwilioSignature.ts
// ========================================

import crypto from "node:crypto";

type TwilioFormValue = string | string[] | undefined;
type TwilioFormParams = Record<string, TwilioFormValue>;

function getRequestHeader(request: Request, name: string): string | null {
  return request.headers.get(name);
}

function normalizePortAwareOrigin(url: URL, request: Request): string {
  const forwardedProto = getRequestHeader(request, "x-forwarded-proto");
  const forwardedHost = getRequestHeader(request, "x-forwarded-host");

  const protocol = forwardedProto || url.protocol.replace(":", "");
  const host = forwardedHost || url.host;

  return `${protocol}://${host}`;
}

export function buildTwilioWebhookUrl(request: Request): string {
  const url = new URL(request.url);
  const origin = normalizePortAwareOrigin(url, request);
  return `${origin}${url.pathname}${url.search}`;
}

function appendParamValue(base: string, key: string, value: TwilioFormValue): string {
  if (typeof value === "undefined") {
    return base;
  }

  if (Array.isArray(value)) {
    return value.reduce((current, item) => current + key + item, base);
  }

  return base + key + value;
}

function computeTwilioSignature(
  authToken: string,
  webhookUrl: string,
  params: TwilioFormParams,
): string {
  const sortedKeys = Object.keys(params).sort();

  const data = sortedKeys.reduce((current, key) => {
    return appendParamValue(current, key, params[key]);
  }, webhookUrl);

  return crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf8"))
    .digest("base64");
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export async function parseTwilioFormRequest(request: Request): Promise<TwilioFormParams> {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return {};
  }

  const rawBody = await request.text();
  const searchParams = new URLSearchParams(rawBody);

  const params: TwilioFormParams = {};

  for (const [key, value] of searchParams.entries()) {
    const existing = params[key];

    if (typeof existing === "undefined") {
      params[key] = value;
      continue;
    }

    if (Array.isArray(existing)) {
      existing.push(value);
      params[key] = existing;
      continue;
    }

    params[key] = [existing, value];
  }

  return params;
}

export async function validateTwilioSignature(
  request: Request,
  params: TwilioFormParams,
): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const providedSignature = request.headers.get("x-twilio-signature");

  if (!authToken || !providedSignature) {
    return false;
  }

  const webhookUrl = buildTwilioWebhookUrl(request);
  const expectedSignature = computeTwilioSignature(authToken, webhookUrl, params);

  return constantTimeEquals(expectedSignature, providedSignature);
}

export async function requireValidTwilioSignature(
  request: Request,
  params: TwilioFormParams,
): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  const isValid = await validateTwilioSignature(request, params);

  if (isValid) {
    return;
  }

  if (!isProduction) {
    console.warn("[twilio] Signature validation failed in non-production environment.");
    return;
  }

  throw new Error("Invalid Twilio signature.");
}

export function getTwilioFormValue(
  params: TwilioFormParams,
  key: string,
): string | null {
  const value = params[key];

  if (typeof value === "undefined") {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}