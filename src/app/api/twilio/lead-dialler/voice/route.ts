import twilio from "twilio";

import { normalizeUkMobileNumber } from "@/lib/phone/normalize";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

let cachedVoiceCallerId: string | null | undefined;

function normalizeUkPhone(value: string) {
  const compact = value.replace(/[^\d+]/g, "");
  if (compact.startsWith("+44")) return compact;
  if (compact.startsWith("44")) return `+${compact}`;
  if (compact.startsWith("0")) return `+44${compact.slice(1)}`;
  return compact.startsWith("+") ? compact : `+${compact}`;
}

async function resolveVoiceCallerId() {
  const configured = (
    process.env.TWILIO_PHONE_NUMBER ||
    process.env.TWILIO_FROM_NUMBER
  )?.trim();

  if (configured) return normalizeUkPhone(configured);
  if (cachedVoiceCallerId !== undefined) return cachedVoiceCallerId;

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    cachedVoiceCallerId = null;
    return cachedVoiceCallerId;
  }

  try {
    const client = twilio(accountSid, authToken);
    const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
    const preferred =
      numbers.find((number) => number.capabilities?.voice && number.phoneNumber?.startsWith("+44")) ||
      numbers.find((number) => number.capabilities?.voice);

    cachedVoiceCallerId = preferred?.phoneNumber
      ? normalizeUkPhone(preferred.phoneNumber)
      : null;
  } catch (error) {
    console.error("Could not resolve a Twilio voice caller ID", error);
    cachedVoiceCallerId = null;
  }

  return cachedVoiceCallerId;
}

async function getFormParams(request: Request) {
  const formData = await request.formData();
  return Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, String(value)]),
  );
}

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = request.headers.get("x-twilio-signature") || "";
  const params = await getFormParams(request);

  if (!authToken || !twilio.validateRequest(authToken, signature, request.url, params)) {
    return new Response("Forbidden", { status: 403 });
  }

  const leadId = String(params.LeadId || "").trim();
  const response = new twilio.twiml.VoiceResponse();

  if (!leadId) {
    response.say({ voice: "alice", language: "en-GB" }, "This SIXFL call could not be started.");
    return new Response(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      phone: true,
      phoneNormalized: true,
      status: true,
    },
  });

  if (!lead || lead.status === "CLOSED") {
    response.say({ voice: "alice", language: "en-GB" }, "This lead is no longer available to call.");
    return new Response(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Only validated UK mobile numbers may be dialled. This is deliberately
  // re-checked here even though the call-list page validates numbers too, so a
  // stale browser tab or manually edited overseas number can never be sent to
  // Twilio Voice.
  const destination = normalizeUkMobileNumber(lead.phoneNormalized || lead.phone);
  const from = await resolveVoiceCallerId();

  if (!destination) {
    response.say({ voice: "alice", language: "en-GB" }, "This lead does not have a valid UK mobile number and cannot be called.");
    return new Response(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (!from) {
    response.say({ voice: "alice", language: "en-GB" }, "The SIXFL voice number is not configured.");
    return new Response(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const calledAt = new Date();
  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO "LeadPhoneCall" ("leadId", "calledAt")
      VALUES (${lead.id}, ${calledAt})
      ON CONFLICT ("leadId")
      DO UPDATE SET "calledAt" = EXCLUDED."calledAt"
    `,
    prisma.interestLead.update({
      where: { id: lead.id },
      data: {
        contactedAt: calledAt,
        status: lead.status === "NEW" ? "CONTACTED" : undefined,
      },
    }),
  ]);

  const dial = response.dial({
    callerId: from,
    answerOnBridge: true,
    timeout: 25,
  });
  dial.number(destination);

  return new Response(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
