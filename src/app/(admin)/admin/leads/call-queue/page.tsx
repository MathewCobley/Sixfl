import Link from "next/link";
import {
  InterestType,
  LeadStatus,
  PreferredNight,
  Prisma,
} from "@prisma/client";

import LeadDiallerQueue, { type DiallerLead } from "@/components/admin/leads/LeadDiallerQueue";
import { normalizeUkMobileNumber } from "@/lib/phone/normalize";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type LeadPhoneCallRow = {
  leadId: string;
  calledAt: Date;
};

type SearchParams = Promise<{
  type?: string;
  status?: string;
  area?: string;
  night?: string;
}>;

export const dynamic = "force-dynamic";

function isInterestType(value?: string): value is InterestType {
  return value === "TEAM" || value === "PLAYER" || value === "REFEREE";
}

function isLeadStatus(value?: string): value is LeadStatus {
  return value === "NEW" || value === "CONTACTED" || value === "QUALIFIED" || value === "CLOSED";
}

function isPreferredNight(value?: string): value is PreferredNight {
  return (
    value === "MONDAY" ||
    value === "TUESDAY" ||
    value === "WEDNESDAY" ||
    value === "THURSDAY" ||
    value === "FRIDAY" ||
    value === "SATURDAY" ||
    value === "SUNDAY" ||
    value === "ANY"
  );
}

function formatInterestType(value: InterestType) {
  if (value === "TEAM") return "Teams";
  if (value === "PLAYER") return "Players";
  return "Referees";
}

function formatLeadStatus(value: LeadStatus) {
  if (value === "NEW") return "New";
  if (value === "CONTACTED") return "Contacted";
  if (value === "QUALIFIED") return "Qualified";
  return "Closed";
}

function formatNight(value: PreferredNight) {
  if (value === "ANY") return "Any night";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export default async function LeadCallQueuePage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const resolvedSearchParams = await searchParams;
  const selectedType = isInterestType(resolvedSearchParams.type) ? resolvedSearchParams.type : undefined;
  const selectedStatus = isLeadStatus(resolvedSearchParams.status) ? resolvedSearchParams.status : undefined;
  const selectedArea = resolvedSearchParams.area?.trim() || undefined;
  const selectedNight = isPreferredNight(resolvedSearchParams.night) ? resolvedSearchParams.night : undefined;

  const leadFilters: Prisma.InterestLeadWhereInput = {
    ...(selectedType ? { interestType: selectedType } : {}),
    ...(selectedStatus ? { status: selectedStatus } : {}),
    ...(selectedArea ? { area: selectedArea } : {}),
    ...(selectedNight ? { preferredNights: { some: { night: selectedNight } } } : {}),
  };

  const leadsRaw = await prisma.interestLead.findMany({
    where: {
      AND: [
        leadFilters,
        { status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
        {
          OR: [
            { phoneNormalized: { not: null } },
            { phone: { not: null } },
          ],
        },
      ],
    },
    orderBy: [{ contactedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      contactName: true,
      teamName: true,
      phone: true,
      phoneNormalized: true,
      area: true,
      status: true,
      interestType: true,
      createdAt: true,
      contactedAt: true,
      message: true,
      league: { select: { name: true } },
    },
  });

  const leads = leadsRaw.filter((lead) => normalizeUkMobileNumber(lead.phoneNormalized || lead.phone));

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
    phone: lead.phone || lead.phoneNormalized,
    area: lead.area,
    status: lead.status,
    interestType: lead.interestType,
    createdAt: lead.createdAt.toISOString(),
    contactedAt: lead.contactedAt?.toISOString() ?? null,
    lastCalledAt: calledByLeadId.get(lead.id)?.toISOString() ?? null,
    message: lead.message,
    leagueName: lead.league?.name ?? null,
  }));

  const preservedParams = new URLSearchParams();
  if (selectedType) preservedParams.set("type", selectedType);
  if (selectedStatus) preservedParams.set("status", selectedStatus);
  if (selectedArea) preservedParams.set("area", selectedArea);
  if (selectedNight) preservedParams.set("night", selectedNight);
  const preservedQuery = preservedParams.toString();
  const backHref = preservedQuery ? `/admin/leads?${preservedQuery}` : "/admin/leads";

  const filterLabels = [
    selectedType ? formatInterestType(selectedType) : null,
    selectedStatus ? formatLeadStatus(selectedStatus) : null,
    selectedArea ? selectedArea : null,
    selectedNight ? formatNight(selectedNight) : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-emerald-400">Lead follow-up</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white md:text-5xl">Call queue</h1>
          <p className="mt-3 max-w-3xl text-white/60">
            This call list comes directly from the filters on Interest leads. Switch Auto Dial on once, and SIXFL will work through the list one lead at a time.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {filterLabels.length ? filterLabels.map((label) => (
              <span key={label} className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-100">
                {label}
              </span>
            )) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/60">All open callable leads</span>
            )}
          </div>
        </div>
        <Link href={backHref} className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">
          ← Interest leads
        </Link>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100/90">
        Only open leads with a valid UK mobile number are callable. SIXFL dials one person at a time; with Auto Dial enabled, unanswered calls are recorded as “No answer” and the next lead is tried automatically. After a conversation, Auto Dial waits for you to record the outcome before continuing.
      </div>

      <LeadDiallerQueue initialLeads={serialized} backHref={backHref} />
    </div>
  );
}
