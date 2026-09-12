import { NextResponse } from "next/server";
import twilio from "twilio";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

type DiallerPayload = {
  action?: "call" | "outcome";
  leadId?: string;
  outcome?: "INTERESTED" | "CALLBACK" | "NO_ANSWER" | "NOT_INTERESTED" | "JOINED";
  note?: string;
  callbackAt?: string;
};

function normalizeUkPhone(value: string) {
  const compact = value.replace(/[^\d+]/g, "");
  if (compact.startsWith("+44")) return compact;
  if (compact.startsWith("44")) return `+${compact}`;
  if (compact.startsWith("0")) return `+44${compact.slice(1)}`;
  return compact.startsWith("+") ? compact : `+${compact}`;
}

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = (
    process.env.TWILIO_PHONE_NUMBER ||
    process.env.TWILIO_FROM_NUMBER ||
    process.env.TWILIO_SMS_FROM
  )?.trim();
  const agent = (
    process.env.TWILIO_DIALER_AGENT_NUMBER ||
    process.env.SIXFL_DIALER_AGENT_NUMBER
  )?.trim();

  if (!accountSid || !authToken || !from || !agent) {
    throw new Error(
      "Lead dialler is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, a Twilio from number, and TWILIO_DIALER_AGENT_NUMBER.",
    );
  }

  return {
    accountSid,
    authToken,
    from: normalizeUkPhone(from),
    agent: normalizeUkPhone(agent),
  };
}

function outcomeLabel(outcome: NonNullable<DiallerPayload["outcome"]>) {
  if (outcome === "INTERESTED") return "Interested";
  if (outcome === "CALLBACK") return "Call back";
  if (outcome === "NO_ANSWER") return "No answer";
  if (outcome === "NOT_INTERESTED") return "Not interested";
  return "Joined";
}

function londonStamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export async function POST(request: Request) {
  await requireAdmin();

  const payload = (await request.json().catch(() => null)) as DiallerPayload | null;
  const leadId = String(payload?.leadId ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ error: "Lead ID is required." }, { status: 400 });
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      contactName: true,
      teamName: true,
      phone: true,
      phoneNormalized: true,
      status: true,
      message: true,
    },
  });

  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  if (payload?.action === "call") {
    const rawPhone = lead.phoneNormalized?.trim() || lead.phone?.trim();
    if (!rawPhone) {
      return NextResponse.json({ error: "This lead has no phone number." }, { status: 400 });
    }
    if (lead.status === "CLOSED") {
      return NextResponse.json({ error: "This lead is closed and cannot be dialled." }, { status: 400 });
    }

    try {
      const config = getTwilioConfig();
      const client = twilio(config.accountSid, config.authToken);
      const leadPhone = normalizeUkPhone(rawPhone);
      const response = new twilio.twiml.VoiceResponse();
      response.say({ voice: "alice", language: "en-GB" }, "SIXFL lead call. Connecting you now.");
      const dial = response.dial({ callerId: config.from, answerOnBridge: true });
      dial.number(leadPhone);

      const call = await client.calls.create({
        to: config.agent,
        from: config.from,
        twiml: response.toString(),
      });

      const calledAt = new Date();
      await prisma.$transaction([
        prisma.$executeRaw`
          INSERT INTO "LeadPhoneCall" ("leadId", "calledAt")
          VALUES (${leadId}, ${calledAt})
          ON CONFLICT ("leadId")
          DO UPDATE SET "calledAt" = EXCLUDED."calledAt"
        `,
        prisma.interestLead.update({
          where: { id: leadId },
          data: {
            contactedAt: calledAt,
            status: lead.status === "NEW" ? "CONTACTED" : undefined,
          },
        }),
      ]);

      return NextResponse.json({
        ok: true,
        callSid: call.sid,
        calledAt: calledAt.toISOString(),
      });
    } catch (error) {
      console.error("Lead dialler call failed", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not start the call." },
        { status: 500 },
      );
    }
  }

  if (payload?.action === "outcome") {
    const outcome = payload.outcome;
    if (!outcome || !["INTERESTED", "CALLBACK", "NO_ANSWER", "NOT_INTERESTED", "JOINED"].includes(outcome)) {
      return NextResponse.json({ error: "Choose a valid call outcome." }, { status: 400 });
    }

    const callbackAt = payload.callbackAt ? new Date(payload.callbackAt) : null;
    if (outcome === "CALLBACK" && (!callbackAt || Number.isNaN(callbackAt.getTime()))) {
      return NextResponse.json({ error: "Choose a valid callback date and time." }, { status: 400 });
    }

    const detailParts = [`Call outcome: ${outcomeLabel(outcome)}`];
    if (callbackAt) detailParts.push(`Callback: ${londonStamp(callbackAt)}`);
    const note = String(payload.note ?? "").trim();
    if (note) detailParts.push(note);
    const entry = `[${londonStamp()}] ${detailParts.join(" · ")}`;
    const message = lead.message?.trim() ? `${lead.message.trim()}\n\n${entry}` : entry;
    const now = new Date();

    const shouldClose = outcome === "NOT_INTERESTED" || outcome === "JOINED";
    const nextStatus =
      shouldClose
        ? "CLOSED"
        : outcome === "INTERESTED"
          ? "QUALIFIED"
          : lead.status === "NEW"
            ? "CONTACTED"
            : lead.status;

    await prisma.interestLead.update({
      where: { id: leadId },
      data: {
        message,
        status: nextStatus,
        contactedAt: now,
        closedAt: shouldClose ? now : undefined,
      },
    });

    return NextResponse.json({ ok: true, status: nextStatus, message });
  }

  return NextResponse.json({ error: "Unknown dialler action." }, { status: 400 });
}
