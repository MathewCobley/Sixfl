import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export async function POST(request: Request) {
  await requireAdmin();

  const payload = (await request.json().catch(() => null)) as { leadId?: string; note?: string } | null;
  const leadId = String(payload?.leadId ?? "").trim();
  const note = String(payload?.note ?? "").trim();

  if (!leadId) return NextResponse.json({ error: "Lead ID is required." }, { status: 400 });
  if (!note) return NextResponse.json({ error: "Please enter a note." }, { status: 400 });

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: { id: true, message: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const stamp = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());

  const entry = `[${stamp}] ${note}`;
  const message = lead.message?.trim() ? `${lead.message.trim()}\n\n${entry}` : entry;

  await prisma.interestLead.update({ where: { id: leadId }, data: { message } });

  return NextResponse.json({ ok: true, message });
}
