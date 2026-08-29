import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await requireAdmin();

  const leads = await prisma.interestLead.findMany({
    select: { id: true, contactedAt: true },
  });

  return NextResponse.json({
    leads: leads.map((lead) => ({
      id: lead.id,
      contactedAt: lead.contactedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: Request) {
  await requireAdmin();

  const payload = (await request.json().catch(() => null)) as { leadId?: string } | null;
  const leadId = String(payload?.leadId ?? "").trim();
  if (!leadId) return NextResponse.json({ error: "Lead ID is required." }, { status: 400 });

  const lead = await prisma.interestLead.findUnique({ where: { id: leadId }, select: { id: true, status: true } });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const contactedAt = new Date();
  await prisma.interestLead.update({
    where: { id: leadId },
    data: { contactedAt, status: lead.status === "NEW" ? "CONTACTED" : undefined },
  });

  return NextResponse.json({ ok: true, leadId, contactedAt: contactedAt.toISOString() });
}
