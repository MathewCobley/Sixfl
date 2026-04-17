// ========================================
// File: src/app/(admin)/admin/leads/page.tsx
// ========================================

import Link from "next/link";
import {
  InterestType,
  LeadStatus,
  LeagueType,
  PreferredNight,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import AdminCard from "@/components/admin/AdminCard";
import BulkLeadEmailForm from "@/components/admin/leads/BulkLeadEmailForm";
import BulkLeadSmsForm from "@/components/admin/leads/BulkLeadSmsForm";
import {
  sendBulkLeadEmailAction,
  sendBulkLeadSmsAction,
  updateLeadStatus,
} from "./actions";

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
  return (
    value === "NEW" ||
    value === "CONTACTED" ||
    value === "QUALIFIED" ||
    value === "CLOSED"
  );
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

function formatPreferredNights(
  values: Array<{ night: PreferredNight }> | PreferredNight[],
) {
  const nights = values.map((value) =>
    typeof value === "string" ? value : value.night,
  );

  if (!nights.length) return "—";

  const uniqueNights = Array.from(new Set(nights));

  if (uniqueNights.includes("ANY")) {
    return "Any";
  }

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
  if (status === "NEW") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "CONTACTED") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-300";
  }
  if (status === "QUALIFIED") {
    return "border-violet-500/20 bg-violet-500/10 text-violet-300";
  }
  return "border-white/10 bg-white/5 text-white/70";
}

function typeClasses(type: InterestType) {
  if (type === "TEAM") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }
  if (type === "PLAYER") {
    return "border-white/10 bg-white/5 text-white";
  }
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

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
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

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: number;
  subtext: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] font-bold tracking-[0.18em] text-white/50">
        {label}
      </div>
      <div className="mt-2 text-3xl font-black tracking-tight text-white">
        {value}
      </div>
      <div className="mt-1 text-sm text-white/55">{subtext}</div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtext,
}: {
  title: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] font-bold tracking-[0.18em] text-white/50">
        {title}
      </div>
      <div className="mt-2 text-xl font-black tracking-tight text-white">
        {value}
      </div>
      <div className="mt-1 text-sm text-white/55">{subtext}</div>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-h-[80px] rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
        {label}
      </div>
      <div className="mt-1 break-words text-sm leading-relaxed text-white/85">
        {value || "—"}
      </div>
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
            ? "cursor-default border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
            : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white",
        ].join(" ")}
      >
        {formatLeadStatus(nextStatus)}
      </button>
    </form>
  );
}

type AreaSummary = {
  area: string;
  total: number;
  teams: number;
  players: number;
  referees: number;
};

type LaunchSignal = {
  area: string;
  night: PreferredNight;
  total: number;
  teams: number;
  players: number;
  referees: number;
};

type RecipientPreviewItem = {
  id: string;
  contactName: string | null;
  email: string;
};

type SmsRecipientPreviewItem = {
  id: string;
  contactName: string | null;
  phone: string;
};

type BulkEmailTemplate = {
  id: string;
  key: string;
  label: string;
  subject: string;
  body: string;
  interestType: InterestType | null;
  ctaLabel: string | null;
  ctaUrlKey: string | null;
};

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};

  const selectedType = isInterestType(sp.type?.toUpperCase())
    ? (sp.type?.toUpperCase() as InterestType)
    : undefined;

  const selectedStatus = isLeadStatus(sp.status?.toUpperCase())
    ? (sp.status?.toUpperCase() as LeadStatus)
    : undefined;

  const selectedNight = isPreferredNight(sp.night?.toUpperCase())
    ? (sp.night?.toUpperCase() as PreferredNight)
    : undefined;

  const selectedArea = sp.area?.trim() || undefined;

  const where = {
    ...(selectedType ? { interestType: selectedType } : {}),
    ...(selectedStatus ? { status: selectedStatus } : {}),
    ...(selectedArea ? { area: selectedArea } : {}),
    ...(selectedNight
      ? {
          preferredNights: {
            some: {
              night: selectedNight,
            },
          },
        }
      : {}),
  };

  const recipientWhere = {
    ...where,
    AND: [
      {
        email: {
          not: null,
        },
      },
      {
        email: {
          not: "",
        },
      },
    ],
  };

  const smsRecipientWhere = {
    ...where,
    AND: [
      {
        phone: {
          not: null,
        },
      },
      {
        phone: {
          not: "",
        },
      },
    ],
  };

  const returnTo = buildHref({
    type: selectedType,
    status: selectedStatus,
    area: selectedArea,
    night: selectedNight,
  });

  const [
    leads,
    totalCount,
    teamCount,
    playerCount,
    refereeCount,
    allAreas,
    newCount,
    contactedCount,
    allLeadsForSummary,
    recipientCount,
    recipientPreview,
    recipientSmsCount,
    recipientSmsPreview,
    leadTemplates,
  ] = await Promise.all([
    prisma.interestLead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        preferredNights: {
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.interestLead.count(),
    prisma.interestLead.count({ where: { interestType: "TEAM" } }),
    prisma.interestLead.count({ where: { interestType: "PLAYER" } }),
    prisma.interestLead.count({ where: { interestType: "REFEREE" } }),
    prisma.interestLead.findMany({
      distinct: ["area"],
      select: { area: true },
      orderBy: { area: "asc" },
    }),
    prisma.interestLead.count({ where: { status: "NEW" } }),
    prisma.interestLead.count({ where: { status: "CONTACTED" } }),
    prisma.interestLead.findMany({
      select: {
        area: true,
        interestType: true,
        leagueType: true,
        preferredNights: {
          select: {
            night: true,
          },
        },
      },
    }),
    prisma.interestLead.count({
      where: recipientWhere,
    }),
    prisma.interestLead.findMany({
      where: recipientWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        contactName: true,
        email: true,
      },
    }),
    prisma.interestLead.count({
      where: smsRecipientWhere,
    }),
    prisma.interestLead.findMany({
      where: smsRecipientWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        contactName: true,
        phone: true,
      },
    }),
    prisma.emailTemplate.findMany({
      where: {
        audience: "LEAD",
        isActive: true,
      },
      orderBy: [{ name: "asc" }],
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
  ]);

  const managedTeams = await prisma.team.findMany({
    where: {
      teamMode: "MANAGED",
      isRecruiting: true,
      joinSlug: {
        not: null,
      },
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      joinSlug: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
    },
  });

  const areas = allAreas
    .map((x) => x.area)
    .filter((value): value is string => Boolean(value));

  const areaMap = new Map<string, AreaSummary>();

  for (const lead of allLeadsForSummary) {
    const area = lead.area?.trim();
    if (!area) continue;

    if (!areaMap.has(area)) {
      areaMap.set(area, {
        area,
        total: 0,
        teams: 0,
        players: 0,
        referees: 0,
      });
    }

    const summary = areaMap.get(area)!;
    summary.total += 1;

    if (lead.interestType === "TEAM") summary.teams += 1;
    if (lead.interestType === "PLAYER") summary.players += 1;
    if (lead.interestType === "REFEREE") summary.referees += 1;
  }

  const areaSummaries = Array.from(areaMap.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.area.localeCompare(b.area);
  });

  const topArea = areaSummaries[0];

  const preferredNightCounts = allLeadsForSummary.reduce<
    Partial<Record<PreferredNight, number>>
  >((acc, lead) => {
    const uniqueNights = Array.from(
      new Set(lead.preferredNights.map((item) => item.night)),
    );

    for (const night of uniqueNights) {
      acc[night] = (acc[night] ?? 0) + 1;
    }

    return acc;
  }, {});

  const mostPopularNightEntry = Object.entries(preferredNightCounts).sort(
    (a, b) => b[1] - a[1],
  )[0] as [PreferredNight, number] | undefined;

  const mostPopularNight = mostPopularNightEntry
    ? `${formatPreferredNight(mostPopularNightEntry[0])}`
    : "—";

  const mensCount = allLeadsForSummary.filter(
    (lead) => lead.leagueType === "MENS",
  ).length;
  const womensCount = allLeadsForSummary.filter(
    (lead) => lead.leagueType === "WOMENS",
  ).length;
  const youthCount = allLeadsForSummary.filter(
    (lead) => lead.leagueType === "YOUTH",
  ).length;

  const launchSignalMap = new Map<string, LaunchSignal>();

  for (const lead of allLeadsForSummary) {
    const area = lead.area?.trim();
    if (!area) continue;

    const uniqueNights = Array.from(
      new Set(lead.preferredNights.map((item) => item.night)),
    ).filter((night) => night !== "ANY");

    for (const night of uniqueNights) {
      const key = `${area}__${night}`;

      if (!launchSignalMap.has(key)) {
        launchSignalMap.set(key, {
          area,
          night,
          total: 0,
          teams: 0,
          players: 0,
          referees: 0,
        });
      }

      const signal = launchSignalMap.get(key)!;
      signal.total += 1;

      if (lead.interestType === "TEAM") signal.teams += 1;
      if (lead.interestType === "PLAYER") signal.players += 1;
      if (lead.interestType === "REFEREE") signal.referees += 1;
    }
  }

  const launchSignals = Array.from(launchSignalMap.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (a.area !== b.area) return a.area.localeCompare(b.area);
    return formatPreferredNight(a.night).localeCompare(
      formatPreferredNight(b.night),
    );
  });

  const strongestLaunchSignal = launchSignals[0];

  const bulkEmailTemplates: BulkEmailTemplate[] = leadTemplates.map(
    (template) => ({
      id: template.id,
      key: template.key,
      label: template.name,
      subject: template.subject,
      body: template.body,
      interestType: template.interestType,
      ctaLabel: template.ctaLabel,
      ctaUrlKey: template.ctaUrlKey,
    }),
  );

  const previewRecipients: RecipientPreviewItem[] = recipientPreview
    .filter((recipient): recipient is typeof recipient & { email: string } =>
      Boolean(recipient.email),
    )
    .map((recipient) => ({
      id: recipient.id,
      contactName: recipient.contactName,
      email: recipient.email,
    }));

  const previewSmsRecipients: SmsRecipientPreviewItem[] = recipientSmsPreview
    .filter((recipient): recipient is typeof recipient & { phone: string } =>
      Boolean(recipient.phone),
    )
    .map((recipient) => ({
      id: recipient.id,
      contactName: recipient.contactName,
      phone: recipient.phone,
    }));

  const managedTeamOptions = managedTeams.map((team) => ({
    value: team.id,
    label: `${team.name}${
      team.league?.name
        ? ` · ${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
        : ""
    }`,
  }));

  return (
    <AdminCard title="Leads">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm text-white/65">
              View team, player and referee interest captured through the SIXFL
              funnel.
            </div>
            <div className="mt-1 text-xs text-white/45">
              {leads.length} result{leads.length === 1 ? "" : "s"} shown
              {selectedType || selectedStatus || selectedArea || selectedNight
                ? " with filters applied"
                : ` from ${totalCount} total leads`}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium hover:bg-black/30"
            >
              Back to admin
            </Link>

            <Link
              href="/admin/leads"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium hover:bg-black/30"
            >
              Clear filters
            </Link>

            <Link
              href="/admin/leads/new"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Add lead
            </Link>

            <Link
              href="/admin/leads/import"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium hover:bg-black/30"
            >
              Import CSV
            </Link>

            <Link
              href="/admin/leads/import-sms"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium hover:bg-black/30"
            >
              Import SMS CSV
            </Link>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_42%),rgba(255,255,255,0.03)] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
            <div className="mb-4 flex flex-col gap-2 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">
                  BULK EMAIL
                </div>
                <div className="mt-2 text-lg font-black text-white">
                  Contact filtered leads by email
                </div>
                <div className="mt-1 text-sm text-white/60">
                  Send a campaign to the current filtered lead set, with preview
                  recipients shown before sending.
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  Matching recipients
                </div>
                <div className="mt-1 text-lg font-black text-white">
                  {recipientCount}
                </div>
              </div>
            </div>

            <BulkLeadEmailForm
              action={sendBulkLeadEmailAction}
              selectedType={selectedType}
              selectedStatus={selectedStatus}
              selectedArea={selectedArea}
              selectedNight={selectedNight}
              recipientCount={recipientCount}
              recipientPreview={previewRecipients}
              templates={bulkEmailTemplates}
              managedTeamOptions={managedTeamOptions}
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_42%),rgba(255,255,255,0.03)] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
            <div className="mb-4 flex flex-col gap-2 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">
                  BULK SMS
                </div>
                <div className="mt-2 text-lg font-black text-white">
                  Contact filtered leads by SMS
                </div>
                <div className="mt-1 text-sm text-white/60">
                  Queue an SMS campaign to the current filtered lead set, with
                  preview recipients shown before sending.
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  Matching recipients
                </div>
                <div className="mt-1 text-lg font-black text-white">
                  {recipientSmsCount}
                </div>
              </div>
            </div>

            <BulkLeadSmsForm
              action={sendBulkLeadSmsAction}
              templates={bulkEmailTemplates}
              selectedType={selectedType}
              selectedStatus={selectedStatus}
              selectedArea={selectedArea}
              selectedNight={selectedNight}
              recipientCount={recipientSmsCount}
              recipientPreview={previewSmsRecipients}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="TOTAL LEADS"
            value={totalCount}
            subtext="All captured interest"
          />
          <StatCard
            label="TEAM INTEREST"
            value={teamCount}
            subtext="Captains and organisers"
          />
          <StatCard
            label="PLAYER INTEREST"
            value={playerCount}
            subtext="Waiting list players"
          />
          <StatCard
            label="REFEREE INTEREST"
            value={refereeCount}
            subtext="Officials pipeline"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="NEW" value={newCount} subtext="Needs follow-up" />
          <StatCard
            label="CONTACTED"
            value={contactedCount}
            subtext="Already touched"
          />
          <StatCard
            label="FILTERED RESULTS"
            value={leads.length}
            subtext="Current view"
          />
          <StatCard
            label="AREAS"
            value={areas.length}
            subtext="Distinct demand zones"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold tracking-[0.2em] text-white/55">
            LEAD SUMMARY
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="TOP AREA"
              value={topArea ? topArea.area : "—"}
              subtext={
                topArea
                  ? `${topArea.total} total leads • ${topArea.teams} teams • ${topArea.players} players • ${topArea.referees} referees`
                  : "No area data yet"
              }
            />
            <SummaryCard
              title="MOST POPULAR NIGHT"
              value={mostPopularNight}
              subtext={
                mostPopularNightEntry
                  ? `${mostPopularNightEntry[1]} leads selected this night`
                  : "No night preference data yet"
              }
            />
            <SummaryCard
              title="MEN’S / WOMEN’S / YOUTH"
              value={`${mensCount} / ${womensCount} / ${youthCount}`}
              subtext="Demand split by league type"
            />
            <SummaryCard
              title="LAUNCH READINESS"
              value={
                strongestLaunchSignal
                  ? `${strongestLaunchSignal.area} • ${formatPreferredNight(
                      strongestLaunchSignal.night,
                    )}`
                  : "Need more leads"
              }
              subtext={
                strongestLaunchSignal
                  ? `${strongestLaunchSignal.total} total signals across teams, players and referees`
                  : "Capture more demand before deciding"
              }
            />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
              Area demand snapshot
            </div>

            {areaSummaries.length === 0 ? (
              <div className="mt-3 text-sm text-white/60">
                No area data available yet.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-white/50">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Area</th>
                      <th className="px-3 py-2 font-semibold">Total</th>
                      <th className="px-3 py-2 font-semibold">Teams</th>
                      <th className="px-3 py-2 font-semibold">Players</th>
                      <th className="px-3 py-2 font-semibold">Referees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areaSummaries.slice(0, 8).map((summary) => (
                      <tr
                        key={summary.area}
                        className="border-t border-white/10 text-white/80"
                      >
                        <td className="px-3 py-2 font-medium text-white">
                          {summary.area}
                        </td>
                        <td className="px-3 py-2">{summary.total}</td>
                        <td className="px-3 py-2">{summary.teams}</td>
                        <td className="px-3 py-2">{summary.players}</td>
                        <td className="px-3 py-2">{summary.referees}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold tracking-[0.2em] text-white/55">
            LAUNCH SIGNALS
          </div>

          <div className="mt-2 text-sm text-white/60">
            Strongest area + night combinations based on current lead demand.
          </div>

          {launchSignals.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
              No launch signal data yet.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Area</th>
                    <th className="px-4 py-3 font-semibold">Night</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Teams</th>
                    <th className="px-4 py-3 font-semibold">Players</th>
                    <th className="px-4 py-3 font-semibold">Referees</th>
                    <th className="px-4 py-3 font-semibold">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {launchSignals.slice(0, 12).map((signal) => (
                    <tr
                      key={`${signal.area}-${signal.night}`}
                      className="border-t border-white/10 text-white/80"
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        {signal.area}
                      </td>
                      <td className="px-4 py-3">
                        {formatPreferredNight(signal.night)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-white">
                        {signal.total}
                      </td>
                      <td className="px-4 py-3">{signal.teams}</td>
                      <td className="px-4 py-3">{signal.players}</td>
                      <td className="px-4 py-3">{signal.referees}</td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            "rounded-full border px-2.5 py-1 text-xs font-bold",
                            signal.total >= 8
                              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                              : signal.total >= 5
                                ? "border-amber-500/30 bg-amber-500/15 text-amber-300"
                                : "border-white/10 bg-white/5 text-white/65",
                          ].join(" ")}
                        >
                          {signal.total >= 8
                            ? "Strong"
                            : signal.total >= 5
                              ? "Building"
                              : "Early"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold tracking-[0.2em] text-white/55">
            FILTERS
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                Lead type
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="All"
                  href={buildHref({
                    status: selectedStatus,
                    area: selectedArea,
                    night: selectedNight,
                  })}
                  active={!selectedType}
                />
                <FilterChip
                  label="Team"
                  href={buildHref({
                    type: "TEAM",
                    status: selectedStatus,
                    area: selectedArea,
                    night: selectedNight,
                  })}
                  active={selectedType === "TEAM"}
                />
                <FilterChip
                  label="Player"
                  href={buildHref({
                    type: "PLAYER",
                    status: selectedStatus,
                    area: selectedArea,
                    night: selectedNight,
                  })}
                  active={selectedType === "PLAYER"}
                />
                <FilterChip
                  label="Referee"
                  href={buildHref({
                    type: "REFEREE",
                    status: selectedStatus,
                    area: selectedArea,
                    night: selectedNight,
                  })}
                  active={selectedType === "REFEREE"}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                Status
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="All"
                  href={buildHref({
                    type: selectedType,
                    area: selectedArea,
                    night: selectedNight,
                  })}
                  active={!selectedStatus}
                />
                {(["NEW", "CONTACTED", "QUALIFIED", "CLOSED"] as LeadStatus[]).map(
                  (status) => (
                    <FilterChip
                      key={status}
                      label={formatLeadStatus(status)}
                      href={buildHref({
                        type: selectedType,
                        status,
                        area: selectedArea,
                        night: selectedNight,
                      })}
                      active={selectedStatus === status}
                    />
                  ),
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                Preferred night
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="All"
                  href={buildHref({
                    type: selectedType,
                    status: selectedStatus,
                    area: selectedArea,
                  })}
                  active={!selectedNight}
                />
                {(
                  [
                    "MONDAY",
                    "TUESDAY",
                    "WEDNESDAY",
                    "THURSDAY",
                    "FRIDAY",
                    "SATURDAY",
                    "SUNDAY",
                    "ANY",
                  ] as PreferredNight[]
                ).map((night) => (
                  <FilterChip
                    key={night}
                    label={formatPreferredNight(night)}
                    href={buildHref({
                      type: selectedType,
                      status: selectedStatus,
                      area: selectedArea,
                      night,
                    })}
                    active={selectedNight === night}
                  />
                ))}
              </div>
            </div>

            {areas.length > 0 ? (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  Area
                </div>
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    label="All"
                    href={buildHref({
                      type: selectedType,
                      status: selectedStatus,
                      night: selectedNight,
                    })}
                    active={!selectedArea}
                  />
                  {areas.map((area) => (
                    <FilterChip
                      key={area}
                      label={area}
                      href={buildHref({
                        type: selectedType,
                        status: selectedStatus,
                        area,
                        night: selectedNight,
                      })}
                      active={selectedArea === area}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {leads.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/60">
            No leads found for the current filters.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Area</th>
                    <th className="px-4 py-3 font-semibold">League</th>
                    <th className="px-4 py-3 font-semibold">Nights</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-t border-white/10 align-top hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-bold ${typeClasses(
                            lead.interestType,
                          )}`}
                        >
                          {formatInterestType(lead.interestType)}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(
                            lead.status,
                          )}`}
                        >
                          {formatLeadStatus(lead.status)}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/leads/${lead.id}`}
                          className="block transition hover:opacity-90"
                        >
                          <div className="font-medium text-white hover:text-emerald-300">
                            {lead.contactName}
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            {lead.teamName || "—"}
                          </div>
                        </Link>
                      </td>

                      <td className="px-4 py-3 text-white/85">
                        {lead.area ?? "—"}
                      </td>

                      <td className="px-4 py-3 text-white/85">
                        {formatLeagueType(lead.leagueType)}
                      </td>

                      <td className="px-4 py-3 text-white/85">
                        {formatPreferredNights(lead.preferredNights)}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          {lead.email ? (
                            <a
                              href={`mailto:${lead.email}`}
                              className="break-all text-emerald-300 hover:text-emerald-200"
                            >
                              {lead.email}
                            </a>
                          ) : (
                            <span className="text-white/40">No email</span>
                          )}

                          {lead.phone ? (
                            <a
                              href={`tel:${lead.phone}`}
                              className="mt-1 text-xs text-white/50"
                            >
                              {lead.phone}
                            </a>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-white/60">
                        {formatDate(lead.createdAt)}
                      </td>

                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/leads/${lead.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-bold tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/20"
                        >
                          View lead
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4">
              {leads.map((lead) => (
                <div
                  key={`${lead.id}-detail`}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-bold text-white">
                          {lead.contactName}
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-bold ${typeClasses(
                            lead.interestType,
                          )}`}
                        >
                          {formatInterestType(lead.interestType)}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(
                            lead.status,
                          )}`}
                        >
                          {formatLeadStatus(lead.status)}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-white/55">
                        Captured {formatDate(lead.createdAt)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/leads/${lead.id}`}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20"
                      >
                        View lead
                      </Link>

                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone}`}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
                        >
                          Call lead
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusButton
                      id={lead.id}
                      nextStatus="NEW"
                      currentStatus={lead.status}
                      returnTo={returnTo}
                    />
                    <StatusButton
                      id={lead.id}
                      nextStatus="CONTACTED"
                      currentStatus={lead.status}
                      returnTo={returnTo}
                    />
                    <StatusButton
                      id={lead.id}
                      nextStatus="QUALIFIED"
                      currentStatus={lead.status}
                      returnTo={returnTo}
                    />
                    <StatusButton
                      id={lead.id}
                      nextStatus="CLOSED"
                      currentStatus={lead.status}
                      returnTo={returnTo}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Detail label="Email" value={lead.email ?? "—"} />
                    <Detail label="Phone" value={lead.phone ?? "—"} />
                    <Detail label="Team name" value={lead.teamName ?? "—"} />
                    <Detail label="Area" value={lead.area ?? "—"} />
                    <Detail
                      label="League type"
                      value={formatLeagueType(lead.leagueType)}
                    />
                    <Detail
                      label="Preferred nights"
                      value={formatPreferredNights(lead.preferredNights)}
                    />
                    <Detail
                      label="Status"
                      value={formatLeadStatus(lead.status)}
                    />
                    <Detail label="Source" value={lead.source ?? "—"} />
                    <Detail
                      label="Free kit interest"
                      value={formatYesNo(lead.wantsFreeKit)}
                    />
                    <Detail
                      label="Marketing consent"
                      value={formatYesNo(lead.marketingConsent)}
                    />
                    <Detail label="Updated" value={formatDate(lead.updatedAt)} />
                    <Detail label="Lead ID" value={lead.id} />
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                      Message
                    </div>
                    <div className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                      {lead.message ?? "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-bold tracking-[0.18em] text-white/50">
                  QUICK VIEW
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/70">
                  <div>
                    Newest lead: {leads[0] ? formatDate(leads[0].createdAt) : "—"}
                  </div>
                  <div>
                    Active filter type:{" "}
                    {selectedType ? formatInterestType(selectedType) : "All"}
                  </div>
                  <div>Active filter area: {selectedArea || "All"}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-bold tracking-[0.18em] text-white/50">
                  WHAT TO LOOK FOR
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/70">
                  <div>Clusters by preferred night</div>
                  <div>Repeated demand in the same area</div>
                  <div>Women’s and youth demand by location</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-bold tracking-[0.18em] text-white/50">
                  NEXT STEP
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/70">
                  <div>Contact high-intent team leads first</div>
                  <div>Group player demand by area and night</div>
                  <div>Build referee coverage before launch week</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminCard>
  );
}
