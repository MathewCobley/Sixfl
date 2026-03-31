// ========================================
// File: src/app/api/twilio/inbound-sms/route.ts
// ========================================

import { NextResponse } from "next/server";
import {
  getTwilioFormValue,
  parseTwilioFormRequest,
  requireValidTwilioSignature,
} from "@/lib/twilio/validateTwilioSignature";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { recordInboundSms } from "@/lib/messaging/service";

function buildTwimlMessageResponse(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(
    message,
  )}</Message></Response>`;
}

function buildEmptyTwimlResponse(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeIncomingBody(body: string | null): string {
  return (body || "").trim();
}

function isStopKeyword(body: string): boolean {
  const value = body.trim().toUpperCase();
  return ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(value);
}

function isStartKeyword(body: string): boolean {
  const value = body.trim().toUpperCase();
  return ["START", "YES", "UNSTOP"].includes(value);
}

function isHelpKeyword(body: string): boolean {
  const value = body.trim().toUpperCase();
  return ["HELP", "INFO"].includes(value);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const params = await parseTwilioFormRequest(request);
    await requireValidTwilioSignature(request, params);

    const rawFrom = getTwilioFormValue(params, "From");
    const rawTo = getTwilioFormValue(params, "To");
    const rawBody = getTwilioFormValue(params, "Body");
    const messageSid = getTwilioFormValue(params, "MessageSid");
    const accountSid = getTwilioFormValue(params, "AccountSid");

    const fromNumber = normalizePhoneNumber(rawFrom);
    const toNumber = normalizePhoneNumber(rawTo);
    const body = normalizeIncomingBody(rawBody);

    if (!fromNumber || !body) {
      return xmlResponse(buildEmptyTwimlResponse(), 200);
    }

    await recordInboundSms({
      fromNumber,
      toNumber,
      body,
      messageSid,
      accountSid,
      rawPayload: params,
    });

    if (isStopKeyword(body)) {
      return xmlResponse(
        buildTwimlMessageResponse(
          "You have been opted out of SMS messages from SIXFL. Reply START to opt back in.",
        ),
      );
    }

    if (isStartKeyword(body)) {
      return xmlResponse(
        buildTwimlMessageResponse(
          "You are opted back in to SMS messages from SIXFL.",
        ),
      );
    }

    if (isHelpKeyword(body)) {
      return xmlResponse(
        buildTwimlMessageResponse(
          "SIXFL support: hello@sixfl.co.uk. Reply STOP to opt out or START to opt back in.",
        ),
      );
    }

    return xmlResponse(buildEmptyTwimlResponse(), 200);
  } catch (error) {
    console.error("[twilio] inbound sms webhook failed", error);
    return xmlResponse(buildEmptyTwimlResponse(), 200);
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      ok: true,
      route: "twilio inbound sms webhook",
    },
    { status: 200 },
  );
}