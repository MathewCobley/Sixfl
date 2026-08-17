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
import LeadConfirmationQuickSendButton from "@/components/admin/leads/LeadConfirmationQuickSendButton";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  sendBulkLeadEmailAction,
  sendBulkLeadSmsAction,
} from "./guarded-bulk-actions";
import { convertLeadToManagedSquadPlayerAction } from "./managed-squad-actions";
import { sendPlayerPoolProfileInviteAction } from "../player-pool/actions";

type SearchParams = Promise<{
  type?: string;
  status?: string;
  area?: string;
  night?: string;
}>;

type TeamConfirmationRow = {
  leadId: string;
  status: string;
  sentAt: Date | null;
  confirmedAt: Date | null;
  declinedAt: Date | null;
};

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

function formatProspectiveLeague(value: {
  name: string;
  season: string | null;
  area: string | null;
  dayOfWeek: PreferredNight | null;
  venueName: string | null;
} | null) {
  if (!value) return "Not set";

  const detailParts = [
    value.season,
    value.area,
    value.dayOfWeek ? formatPreferredNight(value.dayOfWeek) : null,
    value.venueName,
  ].filter(Boolean);

  return detailParts.length ? `${value.name} · ${detailParts.join(" · ")}` : value.name;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

function getConfirmationMeta(row: TeamConfirmationRow | null | undefined) {
  if (!row) return null;

  if (row.status === "CONFIRMED") {
    return {
      label: row.confirmedAt ? `Confirmed ${formatDateTime(row.confirmedAt)}` : "Confirmed",
      className: "text-emerald-200/80",
    };
  }

  if (row.status === "DECLINED") {
    return {
      label: row.declinedAt ? `Declined ${formatDateTime(row.declinedAt)}` : "Declined",
      className: "text-red-200/80",
    };
  }

  if (row.sentAt) {
    return {
      label: `Sent ${formatDateTime(row.sentAt)}`,
      className: "text-sky-200/75",
    };
  }

  return {
    label: "Link pending",
    className: "text-white/40",
  };
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

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={["inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]", className].join(" ")}>
      {children}
    </span>
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

  const [leads, stats, emailTemplatesRaw, smsTemplatesRaw, managedTeams] = await Promise.all([
    prisma.interestLead.findMany({
      where: leadWhere,
      orderBy: { createdAt: "desc" },
      include: {
        preferredNights: true,
        league: {
          select: {
            name: true,
            season: true,
            area: true,
            dayOfWeek: true,
            venueName: true,
          },
        },
      },
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
    prisma.notificationTemplate.findMany({
      where: {
        isActive: true,
        channel: "SMS",
        audience: {
          in: ["LEAD", "GENERAL"],
        },
      },
      orderBy: [{ audience: "asc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        body: true,
        ctaUrlKey: true,
      },
    }),
    prisma.team.findMany({
      where: {
        teamMode: "MANAGED",
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, leagueId: true },
    }),
  ]);

  const confirmationRows = leads.length
    ? await prisma.$queryRaw<Array<TeamConfirmationRow>>(Prisma.sql`
        SELECT
          "leadId",
          "status"::text AS "status",
          "sentAt",
          "confirmedAt",
          "declinedAt"
        FROM "LeadTeamConfirmation"
        WHERE "leadId" IN (${Prisma.join(leads.map((lead) => lead.id))})
      `)
    : [];

  const confirmationByLeadId = new Map(
    confirmationRows.map((row) => [row.leadId, row]),
  );

  void stats;

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

  const smsTemplates = smsTemplatesRaw.map((template) => ({
    id: template.id,
    key: template.key,
    label: template.name,
    body: template.body,
    description: template.description,
    interestType: null,
    ctaUrlKey: template.ctaUrlKey,
  }));

  const totalLeads = leads.length;
  const newLeads = leads.filter((lead) => lead.status === "NEW").length;
  const teamLeads = leads.filter((lead) => lead.interestType === "TEAM").length;
  const playerLeads = leads.filter((lead) => lead.interestType === "PLAYER").length;
  const refereeLeads = leads.filter((lead) => lead.interestType === "REFEREE").length;
  const prospectiveLeagueLeads = leads.filter((lead) => Boolean(lead.league)).length;

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
        <StatCard label="Prospective" value={prospectiveLeagueLeads} subtext="Linked to a likely league" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard title="Demand split" value={`${teamLeads} teams · ${playerLeads} players · ${refereeLeads} refs`} subtext="Breakdown by enquiry type" />
        <SummaryCard title="Top area" value={topArea?.[0] ?? "—"} subtext={topArea ? `${topArea[1]} matching lead${topArea[1] === 1 ? "" : "s"}` : "No area data yet"} />
        <SummaryCard title="Popular night" value={popularNight ? formatPreferredNight(popularNight[0] as PreferredNight) : "—"} subtext={popularNight ? `${popularNight[1]} preference${popularNight[1] === 1 ? "" : "s"}` : "No night preference yet"} />
      </div>

      <AdminCard className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Filters</p>
            <p className="mt-1 text-sm text-white/55">Filter the lead list without opening bulk messaging.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <FilterChip label="All" href="/admin/leads" active={!selectedType && !selectedStatus && !selectedArea && !selectedNight} />
            {Object.values(InterestType).map((type) => <FilterChip key={type} label={formatInterestType(type)} href={buildHref({ type })} active={selectedType === type} />)}
            {Object.values(LeadStatus).map((status) => <FilterChip key={status} label={formatLeadStatus(status)} href={buildHref({ type: selectedType, status })} active={selectedStatus === status} />)}
          </div>
        </div>
      </AdminCard>

      <AdminCard className="overflow-hidden p-0">
        <div className="flex flex-col gap-1 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">Lead list</p>
            <div className="mt-1 text-sm text-white/55">Showing <span className="font-semibold text-white">{leads.length}</span> lead{leads.length === 1 ? "" : "s"}</div>
          </div>
          <p className="text-xs text-white/35">Prospective league is for planning and email context only.</p>
        </div>

        {leads.length === 0 ? (
          <div className="px-6 py-10 text-center text-white/55">No leads match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1460px] border-collapse text-left text-sm">
              <thead className="border-b border-white/10 bg-black/25 text-[11px] uppercase tracking-[0.16em] text-white/35">
                <tr>
                  <th className="px-4 py-3 font-semibold">Lead</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Area</th>
                  <th className="px-4 py-3 font-semibold">League type</th>
                  <th className="px-4 py-3 font-semibold">Nights</th>
                  <th className="px-4 py-3 font-semibold">Prospective league</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {leads.map((lead) => {
                  const leadTitle = lead.teamName || lead.contactName || "Unnamed lead";
                  const contactLine = [lead.email, lead.phone].filter(Boolean).join(" · ");
                  const prospectiveLeague = formatProspectiveLeague(lead.league);
                  const confirmation = confirmationByLeadId.get(lead.id) ?? null;
                  const confirmationMeta = getConfirmationMeta(confirmation);
                  const canSendConfirmation = lead.interestType === "TEAM" && Boolean(lead.email?.trim()) && Boolean(lead.league);
                  const managedTeamsForLeague = lead.leagueId
                    ? managedTeams.filter((team) => team.leagueId === lead.leagueId)
                    : [];
                  const managedTeamForLeague =
                    managedTeamsForLeague.length === 1 ? managedTeamsForLeague[0] : null;
                  const canAddToManagedSquad =
                    lead.interestType === "PLAYER" &&
                    lead.status !== "CLOSED" &&
                    Boolean(lead.email?.trim()) &&
                    Boolean(managedTeamForLeague);
                  const canSendPlayerPoolInvite =
                    lead.interestType === "PLAYER" &&
                    lead.status !== "CLOSED" &&
                    Boolean(lead.email?.trim());
                  const managedSquadActionTitle =
                    lead.status === "CLOSED"
                      ? "This lead is already closed"
                      : !lead.email?.trim()
                        ? "Add an email address before sending the squad signup form"
                        : !lead.leagueId
                          ? "Set a prospective league before adding this player to a managed squad"
                          : managedTeamsForLeague.length === 0
                            ? "No managed squad is set up for this prospective league"
                            : managedTeamsForLeague.length > 1
                              ? "More than one managed squad exists for this league. Open the lead to choose the correct squad."
                              : `Add to ${managedTeamForLeague?.name ?? "managed squad"} and email the signup form`;
                  const playerPoolActionTitle =
                    lead.status === "CLOSED"
                      ? "This lead is already closed"
                      : lead.email?.trim()
                        ? "Create or update the PlayerPool profile and send the invitation email"
                        : "Add an email address before sending a PlayerPool invitation";

                  return (
                    <tr key={lead.id} className="align-top transition hover:bg-white/[0.035]">
                      <td className="max-w-[230px] px-4 py-3">
                        <div className="font-semibold text-white">{leadTitle}</div>
                        {lead.contactName && lead.contactName !== leadTitle ? (
                          <div className="mt-1 truncate text-xs text-white/45">{lead.contactName}</div>
                        ) : null}
                        {lead.wantsFreeKit ? (
                          <div className="mt-1 text-xs font-semibold text-amber-200">Free kit</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={typeClasses(lead.interestType)}>{formatInterestType(lead.interestType)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={statusClasses(lead.status)}>{formatLeadStatus(lead.status)}</Badge>
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <div className="truncate text-white/80">{contactLine || "—"}</div>
                        {lead.message ? <div className="mt-1 truncate text-xs text-white/35">{lead.message}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-white/70">{lead.area || "—"}</td>
                      <td className="px-4 py-3 text-white/70">{formatLeagueType(lead.leagueType)}</td>
                      <td className="px-4 py-3 text-white/70">{formatPreferredNights(lead.preferredNights)}</td>
                      <td className="max-w-[300px] px-4 py-3">
                        <div className={lead.league ? "truncate font-medium text-emerald-100" : "truncate text-amber-200/80"}>
                          {prospectiveLeague}
                        </div>
                        {!lead.league ? (
                          <div className="mt-1 text-xs text-white/35">Set on edit lead</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-white/55">{formatDate(lead.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-2">
                          {lead.interestType === "TEAM" ? (
                            <>
                              <LeadConfirmationQuickSendButton
                                leadId={lead.id}
                                canSend={canSendConfirmation}
                                alreadySent={Boolean(confirmation?.sentAt)}
                              />
                              {confirmationMeta ? (
                                <div className={`max-w-[150px] text-right text-[11px] leading-4 ${confirmationMeta.className}`}>
                                  {confirmationMeta.label}
                                </div>
                              ) : null}
                            </>
                          ) : null}
                          {lead.interestType === "PLAYER" ? (
                            <>
                              {managedTeamForLeague ? (
                                <form action={convertLeadToManagedSquadPlayerAction}>
                                  <input type="hidden" name="leadId" value={lead.id} />
                                  <input type="hidden" name="teamId" value={managedTeamForLeague.id} />
                                  <button
                                    type="submit"
                                    disabled={!canAddToManagedSquad}
                                    title={managedSquadActionTitle}
                                    className="inline-flex min-h-9 max-w-[150px] items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-center text-xs font-bold leading-4 text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/30"
                                  >
                                    Add to managed squad
                                  </button>
                                </form>
                              ) : managedTeamsForLeague.length > 1 ? (
                                <button
                                  type="button"
                                  disabled
                                  title={managedSquadActionTitle}
                                  className="inline-flex min-h-9 max-w-[150px] cursor-not-allowed items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-xs font-bold leading-4 text-white/30"
                                >
                                  Add to managed squad
                                </button>
                              ) : null}
                              <form action={sendPlayerPoolProfileInviteAction}>
                                <input type="hidden" name="leadId" value={lead.id} />
                                <button
                                  type="submit"
                                  disabled={!canSendPlayerPoolInvite}
                                  title={playerPoolActionTitle}
                                  className="inline-flex min-h-9 max-w-[150px] items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-center text-xs font-bold leading-4 text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/30"
                                >
                                  Send to PlayerPool
                                </button>
                              </form>
                            </>
                          ) : null}
                          <Link href={`/admin/leads/${lead.id}`} className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-bold tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/20">
                            Open
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <AdminCard className="overflow-hidden p-0">
        <details className="group">
          <summary className="flex cursor-pointer list-none flex-col gap-4 px-6 py-5 transition hover:bg-white/[0.03] md:flex-row md:items-center md:justify-between [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300/80">Bulk messaging</p>
              <h2 className="mt-1 text-xl font-black text-white">Open bulk email / SMS tools</h2>
              <p className="mt-1 text-sm text-white/55">Hidden by default so the Leads page stays focused on enquiries.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-white/65">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{emailRecipientLeads.length} email-ready</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{smsRecipientLeads.length} SMS-ready</span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-100 group-open:hidden">Open</span>
              <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 group-open:inline-flex">Close</span>
            </div>
          </summary>

          <div className="border-t border-white/10 p-6">
            <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100/90">
              Bulk messaging uses the current filters above. Check the recipient preview before queueing anything.
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
          </div>
        </details>
      </AdminCard>
    </div>
  );
}
