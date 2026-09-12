import twilio from "twilio";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function normalizeUkPhone(value: string) {
  const compact = value.replace(/[^\d+]/g, "");
  if (compact.startsWith("+44")) return compact;
  if (compact.startsWith("44")) return `+${compact}`;
  if (compact.startsWith("0")) return `+44${compact.slice(1)}`;
  return compact.startsWith("+") ? compact : `+${compact}`;
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

  const rawPhone = lead.phoneNormalized?.trim() || lead.phone?.trim();
  const from = (
    process.env.TWILIO_PHONE_NUMBER ||
    process.env.TWILIO_FROM_NUMBER
  )?.trim();

  if (!rawPhone || !from) {
    response.say({ voice: "alice", language: "en-GB" }, "This lead does not have a callable number or the SIXFL voice number is not configured.");
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
    callerId: normalizeUkPhone(from),
    answerOnBridge: true,
    timeout: 25,
  });
  dial.number(normalizeUkPhone(rawPhone));

  return new Response(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
