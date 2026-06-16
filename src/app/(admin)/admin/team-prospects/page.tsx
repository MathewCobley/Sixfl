// ========================================
// File: src/app/(admin)/admin/team-prospects/page.tsx
// ========================================

import Link from "next/link";
import { InterestType, LeadStatus } from "@prisma/client";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Prospect Teams | SIXFL Admin",
};

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStatusClasses(status: LeadStatus) {
  switch (status) {
    case "NEW":
      return "border-white/10 bg-white/5 text-white/75";
    case "CONTACTED":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "QUALIFIED":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "CLOSED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function formatStatus(status: LeadStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatLeagueType(value: string | null | undefined) {
  if (!value) return null;

  switch (value) {
    case "MENS":
      return "Men's";
    case "WOMENS":
      return "Women's";
    case "YOUTH":
      return "Youth";
    default:
      return value;
  }
}

function StatCard({
  label,
  value,
  helper,
  tone = "white",
}: {
  label: string;
  value: number;
  helper: string;
  tone?: "white" | "emerald" | "amber" | "sky" | "red";
}) {
  const toneClasses =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-500/10 text-amber-100/70"
        : tone === "sky"
          ? "border-sky-400/20 bg-sky-500/10 text-sky-100/70"
          : tone === "red"
            ? "border-red-400/20 bg-red-500/10 text-red-100/70"
            : "border-white/10 bg-white/[0.04] text-white/45";

  return (
    <div className={`rounded-3xl border p-5 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-white/55">{helper}</p>
    </div>
  );
}

export default async function AdminTeamProspectsPage() {
  await requireAdmin();

  const leads = await prisma.interestLead.findMany({
    where: {
      interestType: InterestType.TEAM,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      league: {
        select: {
          id: true,
          name: true,
          season: true,
        },
      },
      convertedTeam: {
        select: {
          id: true,
          name: true,
          teamMode: true,
        },
      },
      preferredNights: {
        orderBy: [{ night: "asc" }],
        select: {
          night: true,
        },
      },
    },
  });

  const newLeads = leads.filter((lead) => lead.status === "NEW");
  const contactedLeads = leads.filter((lead) => lead.status === "CONTACTED");
  const qualifiedLeads = leads.filter((lead) => lead.status === "QUALIFIED");
  const closedLeads = leads.filter((lead) => lead.status === "CLOSED");
  const convertedLeads = leads.filter((lead) => Boolean(lead.convertedTeamId));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Team pipeline
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Prospect teams
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-white/70 sm:text-base">
              Admin-owned view for teams that have expressed interest, may join later, have paused, dropped out, or are waiting for the right league slot.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="New" value={newLeads.length} helper="Need first response" />
            <StatCard label="Contacted" value={contactedLeads.length} helper="Conversation started" tone="sky" />
            <StatCard label="Qualified" value={qualifiedLeads.length} helper="Likely team prospect" tone="emerald" />
            <StatCard label="Closed" value={closedLeads.length} helper="Dropped / not now" tone="red" />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Team enquiries</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Prospect team list</h2>
          </div>
          <div className="text-sm text-white/50">
            {leads.length} total · {convertedLeads.length} converted
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {leads.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">
              No team prospects yet.
            </div>
          ) : null}

          {leads.map((lead) => {
            const preferredNights = lead.preferredNights.map((item) => item.night).join(", ");
            const leagueLabel = lead.league
              ? `${lead.league.name}${lead.league.season ? ` · ${lead.league.season}` : ""}`
              : null;
            const teamLabel = lead.teamName?.trim() || lead.contactName;

            return (
              <article
                key={lead.id}
                className="rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-emerald-400/20 hover:bg-black/25"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{teamLabel}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(lead.status)}`}>
                        {formatStatus(lead.status)}
                      </span>
                      {lead.convertedTeam ? (
                        <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
                          Converted
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/45">
                      <span>Contact: {lead.contactName}</span>
                      {lead.email ? <span>{lead.email}</span> : null}
                      {lead.phone ? <span>{lead.phone}</span> : null}
                    </div>

                    {lead.message ? (
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/60">{lead.message}</p>
                    ) : null}
                  </div>

                  <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Fit / context</div>
                    <div className="mt-2 space-y-1 text-sm text-white/55">
                      {lead.area ? <div>Area: {lead.area}</div> : null}
                      {lead.leagueType ? <div>Type: {formatLeagueType(lead.leagueType)}</div> : null}
                      {preferredNights ? <div>Nights: {preferredNights}</div> : null}
                      {leagueLabel ? <div>League: {leagueLabel}</div> : null}
                      {lead.source ? <div>Source: {lead.source}</div> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                    >
                      Open lead
                    </Link>
                    {lead.convertedTeam ? (
                      <Link
                        href={`/admin/teams/${lead.convertedTeam.id}`}
                        className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
                      >
                        Team
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/35">
                  <span>Added {formatDate(lead.createdAt)}</span>
                  <span>Updated {formatDate(lead.updatedAt)}</span>
                  {lead.contactedAt ? <span>Contacted {formatDate(lead.contactedAt)}</span> : null}
                  {lead.closedAt ? <span>Closed {formatDate(lead.closedAt)}</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
