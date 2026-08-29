import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LeadPhoneCallRow = {
  leadId: string;
  calledAt: Date;
};

export async function GET() {
  await requireAdmin();

  const calls = await prisma.$queryRaw<LeadPhoneCallRow[]>(Prisma.sql`
    SELECT "leadId", "calledAt"
    FROM "LeadPhoneCall"
  `);

  return NextResponse.json({
    leads: calls.map((call) => ({
      id: call.leadId,
      calledAt: call.calledAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  await requireAdmin();

  const payload = (await request.json().catch(() => null)) as { leadId?: string } | null;
  const leadId = String(payload?.leadId ?? "").trim();
  if (!leadId) return NextResponse.json({ error: "Lead ID is required." }, { status: 400 });

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: { id: true, status: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const calledAt = new Date();

  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO "LeadPhoneCall" ("leadId", "calledAt")
      VALUES (${leadId}, ${calledAt})
      ON CONFLICT ("leadId")
      DO UPDATE SET "calledAt" = EXCLUDED."calledAt"
    `),
    prisma.interestLead.update({
      where: { id: leadId },
      data: {
        contactedAt: calledAt,
        status: lead.status === "NEW" ? "CONTACTED" : undefined,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, leadId, calledAt: calledAt.toISOString() });
}
