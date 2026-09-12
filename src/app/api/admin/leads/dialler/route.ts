import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

type DiallerPayload = {
  action?: "outcome";
  leadId?: string;
  outcome?: "INTERESTED" | "CALLBACK" | "NO_ANSWER" | "NOT_INTERESTED" | "JOINED";
  note?: string;
  callbackAt?: string;
};

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
      status: true,
      message: true,
    },
  });

  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

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
