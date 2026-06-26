// ========================================
// File: src/app/(admin)/admin/leads/page.tsx
// ========================================

import Link from "next/link";
import {
  InterestType,
  LeadStatus,
  LeagueType,
  PreferredNight,
  Prisma,
} from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import BulkLeadEmailForm from "@/components/admin/leads/BulkLeadEmailForm";
import BulkLeadSmsForm from "@/components/admin/leads/BulkLeadSmsForm";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { updateLeadStatus } from "./actions";
import {
  sendBulkLeadEmailAction,
  sendBulkLeadSmsAction,
} from "./guarded-bulk-actions";

type SearchParams = Promise<{
  type?: string;
  status?: string;
  area?: string;
  night?: string;
}>;

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
  if (value === "TEAM") return "Team";
  if (value === "PLAYER") return "Player";
  return "Referee";
}

function formatLeadStatus(value: LeadStatus) {
  if (value === "NEW") return "New";
  if (value === "CONTACTED") return "Contacted";
  if (value === "QUALIFIED") return "Qualified";
  return "Closed";
}

function formatLeagueType(value: LeagueType | null) {
  if (!value) return "—";
  if (value === "MENS") return "Men’s";
  if (value === "WOMENS") return "Women’s";
  return "Youth";
}

function formatPreferredNight(value: PreferredNight) {
  if (value === "ANY") return "Any";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatPreferredNights(values: Array<{ night: PreferredNight }>) {
  const nights = values.map((value) => value.night);
  if (!nights.length) return "—";

  const uniqueNights = Array.from(new Set(nights));
  if (uniqueNights.includes("ANY")) return "Any";
  return uniqueNights.map(formatPreferredNight).join(", ");
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatYesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function statusClasses(status: LeadStatus) {
  if (status === "NEW") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (status === "CONTACTED") return "border-blue-500/20 bg-blue-500/10 text-blue-300";
  if (status === "QUALIFIED") return "border-violet-500/20 bg-violet-500/10 text-violet-300";
  return "border-white/10 bg-white/5 text-white/70";
}

function typeClasses(type: InterestType) {
  if (type === "TEAM") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (type === "PLAYER") return "border-white/10 bg-white/5 text-white";
  return "border-amber-500/20 bg-amber-500/10 text-amber-300";
}

function buildHref(params: {
  type?: string;
  status?: string;
  area?: string;
  night?: string;
}) {
  const search = new URLSearchParams();

  if (params.type) search.set("type", params.type);
  if (params.status) search.set("status", params.status);
  if (params.area) search.set("area", params.area);
  if (params.night) search.set("night", params.night);

  const query = search.toString();
  return query ? `/admin/leads?${query}` : "/admin/leads";
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex h-10 items-center justify-center rounded-full px-4 text-xs font-bold tracking-[0.16em] transition",
        active
          ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
          : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function StatCard({ label, value, subtext }: { label: string; value: number; subtext: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] font-bold tracking-[0.18em] text-white/50">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight text-white">{value}</div>
      <div className="mt-1 text-sm text-white/55">{subtext}</div>
    </div>
  );
}

function SummaryCard({ title, value, subtext }: { title: string; value: string; subtext: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] font-bold tracking-[0.18em] text-white/50">{title}</div>
      <div className="mt-2 text-xl font-black tracking-tight text-white">{value}</div>
      <div className="mt-1 text-sm text-white/55">{subtext}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-[80px] rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-1 break-words text-sm leading-relaxed text-white/85">{value || "—"}</div>
    </div>
  );
}

function StatusButton({
  id,
  nextStatus,
  currentStatus,
  returnTo,
}: {
  id: string;
  nextStatus: LeadStatus;
  currentStatus: LeadStatus;
  returnTo: string;
}) {
  const isActive = currentStatus === nextStatus;

  return (
    <form action={updateLeadStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={nextStatus} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        disabled={isActive}
        className={[
          "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-bold tracking-[0.12em] transition",
          isActive
            ? "cursor-not-allowed border-white/5 bg-white/[0.03] text-white/30"
            : "border-white/10 bg-white/[0.04] text-white/70 hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300",
        ].join(" ")}
      >
        {formatLeadStatus(nextStatus)}
      </button>
    </form>
  );
}

export default async function AdminLeadsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const resolvedSearchParams = await searchParams;
  const selectedType = isInterestType(resolvedSearchParams.type) ? resolvedSearchParams.type : undefined;
  const selectedStatus = isLeadStatus(resolvedSearchParams.status) ? resolvedSearchParams.status : undefined;
  const selectedArea = resolvedSearchParams.area?.trim() || undefined;
  const selectedNight = isPreferredNight(resolvedSearchParams.night) ? resolvedSearchParams.night : undefined;

  const leadWhere: Prisma.InterestLeadWhereInput = {
    ...(selectedType ? { interestType: selectedType } : {}),
    ...(selectedStatus ? { status: selectedStatus } : {}),
    ...(selectedArea ? { area: selectedArea } : {}),
    ...(selectedNight ? { preferredNights: { some: { night: selectedNight } } } : {}),
  };

  const [leads, stats, emailTemplatesRaw, smsTemplates, managedTeams] = await Promise.all([
    prisma.interestLead.findMany({
      where: leadWhere,
      orderBy: { createdAt: "desc" },
      include: { preferredNights: true },
    }),
    prisma.interestLead.groupBy({
      by: ["interestType", "status"],
      _count: true,
    }),
    prisma.emailTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ interestType: "asc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        subject: true,
        body: true,
        interestType: true,
        ctaLabel: true,
        ctaUrlKey: true,
      },
    }),
    prisma.smsTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ interestType: "asc" }, { label: "asc" }],
      select: {
        id: true,
        key: true,
        label: true,
        body: true,
        description: true,
        interestType: true,
        ctaUrlKey: true,
      },
    }),
    prisma.team.findMany({
      where: {
        teamMode: "MANAGED",
        isRecruiting: true,
        joinSlug: { not: null },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, joinSlug: true },
    }),
  ]);

  const templates = emailTemplatesRaw.map((template) => ({
    id: template.id,
    key: template.key,
    label: template.name,
    subject: template.subject,
    body: template.body,
    interestType: template.interestType,
    ctaLabel: template.ctaLabel,
    ctaUrlKey: template.ctaUrlKey,
  }));

  const totalLeads = leads.length;
  const newLeads = leads.filter((lead) => lead.status === "NEW").length;
  const teamLeads = leads.filter((lead) => lead.interestType === "TEAM").length;
  const playerLeads = leads.filter((lead) => lead.interestType === "PLAYER").length;
  const refereeLeads = leads.filter((lead) => lead.interestType === "REFEREE").length;

  const topArea = Object.entries(
    leads.reduce<Record<string, number>>((acc, lead) => {
      const area = lead.area?.trim() || "Unknown";
      acc[area] = (acc[area] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1])[0];

  const preferredNightCounts = leads.reduce<Record<string, number>>((acc, lead) => {
    const nights = lead.preferredNights.length ? lead.preferredNights.map((item) => item.night) : ["ANY" as PreferredNight];
    for (const night of nights) acc[night] = (acc[night] ?? 0) + 1;
    return acc;
  }, {});

  const popularNight = Object.entries(preferredNightCounts).sort((a, b) => b[1] - a[1])[0];
  const emailRecipientLeads = leads.filter((lead) => lead.email?.trim());
  const smsRecipientLeads = leads.filter((lead) => lead.phone?.trim());
  const emailRecipientPreview = emailRecipientLeads.slice(0, 50).map((lead) => ({
    id: lead.id,
    contactName: lead.contactName,
    email: lead.email || "",
  }));
  const smsRecipientPreview = smsRecipientLeads.slice(0, 50).map((lead) => ({
    id: lead.id,
    contactName: lead.contactName,
    phone: lead.phone || "",
  }));
  const managedTeamOptions = managedTeams.map((team) => ({ value: team.id, label: team.name }));

  const currentHref = buildHref({
    type: selectedType,
    status: selectedStatus,
    area: selectedArea,
    night: selectedNight,
  });

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-emerald-400">Admin</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white md:text-5xl">Interest leads</h1>
          <p className="mt-3 max-w-3xl text-white/60">View enquiries, filter demand and contact potential teams, players and referees.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/leads/import" className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-white transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300">Import CSV</Link>
          <Link href="/admin/leads/new" className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-5 py-3 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20">Add lead</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total" value={totalLeads} subtext="Matching leads" />
        <StatCard label="New" value={newLeads} subtext="Awaiting contact" />
        <StatCard label="Teams" value={teamLeads} subtext="Team enquiries" />
        <StatCard label="Players" value={playerLeads} subtext="Individual players" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard title="Demand split" value={`${teamLeads} teams · ${playerLeads} players · ${refereeLeads} refs`} subtext="Breakdown by enquiry type" />
        <SummaryCard title="Top area" value={topArea?.[0] ?? "—"} subtext={topArea ? `${topArea[1]} matching lead${topArea[1] === 1 ? "" : "s"}` : "No area data yet"} />
        <SummaryCard title="Popular night" value={popularNight ? formatPreferredNight(popularNight[0] as PreferredNight) : "—"} subtext={popularNight ? `${popularNight[1]} preference${popularNight[1] === 1 ? "" : "s"}` : "No night preference yet"} />
      </div>

      <AdminCard className="space-y-5 p-6">
        <div className="flex flex-wrap gap-3">
          <FilterChip label="All" href="/admin/leads" active={!selectedType && !selectedStatus && !selectedArea && !selectedNight} />
          {Object.values(InterestType).map((type) => <FilterChip key={type} label={formatInterestType(type)} href={buildHref({ type })} active={selectedType === type} />)}
          {Object.values(LeadStatus).map((status) => <FilterChip key={status} label={formatLeadStatus(status)} href={buildHref({ type: selectedType, status })} active={selectedStatus === status} />)}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <BulkLeadEmailForm
            templates={templates}
            selectedType={selectedType}
            selectedStatus={selectedStatus}
            selectedArea={selectedArea}
            selectedNight={selectedNight}
            recipientCount={emailRecipientLeads.length}
            recipientPreview={emailRecipientPreview}
            managedTeamOptions={managedTeamOptions}
            action={sendBulkLeadEmailAction}
          />

          <BulkLeadSmsForm
            templates={smsTemplates}
            selectedType={selectedType}
            selectedStatus={selectedStatus}
            selectedArea={selectedArea}
            selectedNight={selectedNight}
            recipientCount={smsRecipientLeads.length}
            recipientPreview={smsRecipientPreview}
            managedTeamOptions={managedTeamOptions}
            action={sendBulkLeadSmsAction}
          />
        </div>
      </AdminCard>

      <AdminCard className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="text-sm text-white/55">Showing <span className="font-semibold text-white">{leads.length}</span> lead{leads.length === 1 ? "" : "s"}</div>
        </div>

        <div className="divide-y divide-white/10">
          {leads.length === 0 ? (
            <div className="px-6 py-10 text-center text-white/55">No leads match the current filters.</div>
          ) : (
            leads.map((lead) => (
              <div key={lead.id} className="space-y-5 px-6 py-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={["rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]", typeClasses(lead.interestType)].join(" ")}>{formatInterestType(lead.interestType)}</span>
                      <span className={["rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]", statusClasses(lead.status)].join(" ")}>{formatLeadStatus(lead.status)}</span>
                      {lead.wantsFreeKit ? <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-300">Free kit</span> : null}
                    </div>
                    <h2 className="mt-3 text-2xl font-black text-white">{lead.teamName || lead.contactName || "Unnamed lead"}</h2>
                    <p className="mt-1 text-sm text-white/45">Created {formatDate(lead.createdAt)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {Object.values(LeadStatus).map((status) => <StatusButton key={status} id={lead.id} currentStatus={lead.status} nextStatus={status} returnTo={currentHref} />)}
                    <Link href={`/admin/leads/${lead.id}`} className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-bold tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/20">Open</Link>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                  <Detail label="Contact" value={lead.contactName || "—"} />
                  <Detail label="Email" value={lead.email || "—"} />
                  <Detail label="Phone" value={lead.phone || "—"} />
                  <Detail label="Area" value={lead.area || "—"} />
                  <Detail label="League" value={formatLeagueType(lead.leagueType)} />
                  <Detail label="Nights" value={formatPreferredNights(lead.preferredNights)} />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <Detail label="Free kit" value={formatYesNo(lead.wantsFreeKit)} />
                  <Detail label="Marketing consent" value={formatYesNo(lead.marketingConsent)} />
                  <Detail label="Message" value={lead.message || "—"} />
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCard>
    </div>
  );
}
