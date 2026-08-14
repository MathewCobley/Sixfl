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
import { recordInboundSms, recordOutboundSms } from "@/lib/messaging/service";
import { prisma } from "@/lib/prisma";

const CANONICAL_SITE_URL = "https://sixfl.co.uk";
const FIXTURE_CONFIRMATION_SMS_SOURCE_TYPES = [
  "FIXTURE_CONFIRMATION_CHASE_SMS",
  "FIXTURE_CONFIRMATION_AUTO_SMS_72H",
  "FIXTURE_CONFIRMATION_AUTO_SMS_24H",
] as const;

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

function isFixtureYesNoReply(body: string): boolean {
  const value = body.trim().toUpperCase();
  return ["YES", "Y", "NO", "N"].includes(value);
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    CANONICAL_SITE_URL
  ).replace(/\/+$/, "");
}

function getMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function findFixtureReplyTarget(fromNumber: string) {
  const recentDispatches = await prisma.notificationDispatch.findMany({
    where: {
      channel: "SMS",
      status: "SENT",
      sourceType: { in: [...FIXTURE_CONFIRMATION_SMS_SOURCE_TYPES] },
      recipient: {
        phoneNormalized: fromNumber,
      },
    },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    take: 12,
    select: {
      sourceId: true,
      metadata: true,
    },
  });

  for (const dispatch of recentDispatches) {
    const sourceParts = dispatch.sourceId?.split(":") ?? [];
    const fixtureId =
      getMetadataString(dispatch.metadata, "fixtureId") || sourceParts[0] || null;
    const teamId =
      getMetadataString(dispatch.metadata, "teamId") || sourceParts[1] || null;

    if (!fixtureId || !teamId) continue;

    const [fixture, confirmation] = await Promise.all([
      prisma.fixture.findUnique({
        where: { id: fixtureId },
        select: {
          id: true,
          status: true,
          publishedAt: true,
          kickoffAt: true,
          homeTeamId: true,
          awayTeamId: true,
        },
      }),
      prisma.fixtureCaptainConfirmation.findUnique({
        where: {
          fixtureId_teamId: {
            fixtureId,
            teamId,
          },
        },
        select: { status: true },
      }),
    ]);

    if (
      !fixture ||
      fixture.status !== "SCHEDULED" ||
      !fixture.publishedAt ||
      fixture.kickoffAt <= new Date() ||
      (fixture.homeTeamId !== teamId && fixture.awayTeamId !== teamId) ||
      confirmation?.status === "CONFIRMED" ||
      confirmation?.status === "ISSUE_RAISED"
    ) {
      continue;
    }

    const url = new URL(
      `/captain/team/${teamId}/fixtures?fixtureId=${encodeURIComponent(fixtureId)}`,
      getSiteUrl(),
    ).toString();

    return { fixtureId, teamId, url };
  }

  return null;
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

    const thread = await recordInboundSms({
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

    if (isFixtureYesNoReply(body)) {
      const target = await findFixtureReplyTarget(fromNumber);

      if (target) {
        const guidance = `Thanks. Your fixture response has not been recorded yet. Please confirm your team's availability using this link: ${target.url}`;

        await recordOutboundSms({
          recipientId: thread?.recipientId ?? null,
          teamId: target.teamId,
          leagueId: thread?.leagueId ?? null,
          sourceType: "FIXTURE_CONFIRMATION_SMS_REPLY_GUIDANCE",
          sourceId: `${target.fixtureId}:${target.teamId}:${messageSid || Date.now()}`,
          contactName: thread?.contactName ?? thread?.team?.name ?? null,
          phone: fromNumber,
          body: guidance,
          fromNumber: toNumber,
          toNumber: fromNumber,
          provider: "twilio",
          providerStatus: "accepted",
          sentAt: new Date(),
        });

        return xmlResponse(buildTwimlMessageResponse(guidance));
      }
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
