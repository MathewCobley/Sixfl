import Link from "next/link";
import { Prisma } from "@prisma/client";

import LeadDiallerQueue, { type DiallerLead } from "@/components/admin/leads/LeadDiallerQueue";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type LeadPhoneCallRow = {
  leadId: string;
  calledAt: Date;
};

export const dynamic = "force-dynamic";

export default async function LeadCallQueuePage() {
  await requireAdmin();

  const leads = await prisma.interestLead.findMany({
    where: {
      status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
      AND: [
        { phone: { not: null } },
        { phone: { not: "" } },
      ],
    },
    orderBy: [{ contactedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      contactName: true,
      teamName: true,
      phone: true,
      area: true,
      status: true,
      interestType: true,
      createdAt: true,
      contactedAt: true,
      message: true,
      league: { select: { name: true } },
    },
  });

  const callRows = leads.length
    ? await prisma.$queryRaw<LeadPhoneCallRow[]>(Prisma.sql`
        SELECT "leadId", "calledAt"
        FROM "LeadPhoneCall"
        WHERE "leadId" IN (${Prisma.join(leads.map((lead) => lead.id))})
      `)
    : [];
  const calledByLeadId = new Map(callRows.map((row) => [row.leadId, row.calledAt]));

  const serialized: DiallerLead[] = leads.map((lead) => ({
    id: lead.id,
    contactName: lead.contactName,
    teamName: lead.teamName,
    phone: lead.phone,
    area: lead.area,
    status: lead.status,
    interestType: lead.interestType,
    createdAt: lead.createdAt.toISOString(),
    contactedAt: lead.contactedAt?.toISOString() ?? null,
    lastCalledAt: calledByLeadId.get(lead.id)?.toISOString() ?? null,
    message: lead.message,
    leagueName: lead.league?.name ?? null,
  }));

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-emerald-400">Lead follow-up</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white md:text-5xl">Call queue</h1>
          <p className="mt-3 max-w-3xl text-white/60">
            Work through open leads using the SIXFL browser phone. Allow microphone access, call from the admin screen and record the outcome before moving to the next lead.
          </p>
        </div>
        <Link href="/admin/leads" className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">
          ← Interest leads
        </Link>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100/90">
        Use this for live SIXFL calls only. Do not call a lead who has asked not to be contacted; recording “Not interested” closes the lead and removes it from this queue.
      </div>

      <LeadDiallerQueue initialLeads={serialized} />
    </div>
  );
}
