// ========================================
// File: src/app/(admin)/admin/expansion-leads/page.tsx
// ========================================

import { LeadStatus, LeagueType, PreferredNight } from "@prisma/client";
import Link from "next/link";

import AdminCard from "@/components/admin/AdminCard";
import {
  EXPANSION_LEAD_PUBLIC_PATH,
  EXPANSION_LEAD_SOURCE,
} from "@/lib/expansion-leads";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { updateExpansionLeadStatusAction } from "./actions";

type SearchParams = Promise<{
  status?: string;
}>;

function isLeadStatus(value?: string): value is LeadStatus {
  return (
    value === LeadStatus.NEW ||
    value === LeadStatus.CONTACTED ||
    value === LeadStatus.QUALIFIED ||
    value === LeadStatus.CLOSED
  );
}

function formatStatus(value: LeadStatus) {
  if (value === LeadStatus.NEW) return "New";
  if (value === LeadStatus.CONTACTED) return "Contacted";
  if (value === LeadStatus.QUALIFIED) return "Qualified";
  return "Closed";
}

function statusClasses(value: LeadStatus) {
  if (value === LeadStatus.NEW) {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  }
  if (value === LeadStatus.CONTACTED) {
    return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  }
  if (value === LeadStatus.QUALIFIED) {
    return "border-violet-400/25 bg-violet-400/10 text-violet-200";
  }
  return "border-white/10 bg-white/5 text-white/55";
}

function formatLeagueType(value: LeagueType | null) {
  if (value === LeagueType.MENS) return "Men’s";
  if (value === LeagueType.WOMENS) return "Women’s";
  if (value === LeagueType.YOUTH) return "Youth";
  return "Not specified";
}

function formatNight(value: PreferredNight) {
  if (value === PreferredNight.ANY) return "Any";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatNights(values: Array<{ night: PreferredNight }>) {
  if (!values.length) return "Not specified";
  if (values.some((value) => value.night === PreferredNight.ANY)) return "Any";
  return values.map((value) => formatNight(value.night)).join(", ");
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

function filterHref(status?: LeadStatus) {
  return status
    ? `/admin/expansion-leads?status=${status}`
    : "/admin/expansion-leads";
}

export default async function ExpansionLeadsAdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();

  const resolvedSearchParams = await searchParams;
  const selectedStatus = isLeadStatus(resolvedSearchParams.status)
    ? resolvedSearchParams.status
    : undefined;

  const sourceWhere = { source: EXPANSION_LEAD_SOURCE } as const;

  const [leads, newCount, contactedCount, qualifiedCount, closedCount] =
    await Promise.all([
      prisma.interestLead.findMany({
        where: {
          ...sourceWhere,
          ...(selectedStatus ? { status: selectedStatus } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          preferredNights: {
            orderBy: { night: "asc" },
          },
        },
      }),
      prisma.interestLead.count({
        where: { ...sourceWhere, status: LeadStatus.NEW },
      }),
      prisma.interestLead.count({
        where: { ...sourceWhere, status: LeadStatus.CONTACTED },
      }),
      prisma.interestLead.count({
        where: { ...sourceWhere, status: LeadStatus.QUALIFIED },
      }),
      prisma.interestLead.count({
        where: { ...sourceWhere, status: LeadStatus.CLOSED },
      }),
    ]);

  const totalCount = newCount + contactedCount + qualifiedCount + closedCount;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.07] p-6 sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
              Growth pipeline
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Expansion opportunities
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              People who have suggested a new area and may be able to introduce
              a venue, opening teams or both. These remain SIXFL-owned leagues;
              commission is only agreed separately after an opportunity is
              approved.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={EXPANSION_LEAD_PUBLIC_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-sm font-bold text-white transition hover:bg-white/10"
            >
              View public page ↗
            </Link>
            <Link
              href="/admin/leads"
              className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-5 text-sm font-extrabold text-black transition hover:bg-emerald-400"
            >
              All leads
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "All", value: totalCount, status: undefined },
          { label: "New", value: newCount, status: LeadStatus.NEW },
          {
            label: "Contacted",
            value: contactedCount,
            status: LeadStatus.CONTACTED,
          },
          {
            label: "Qualified",
            value: qualifiedCount,
            status: LeadStatus.QUALIFIED,
          },
          { label: "Closed", value: closedCount, status: LeadStatus.CLOSED },
        ].map((item) => {
          const active = selectedStatus === item.status;
          return (
            <Link
              key={item.label}
              href={filterHref(item.status)}
              className={[
                "rounded-2xl border p-4 transition",
                active
                  ? "border-emerald-400/35 bg-emerald-400/12"
                  : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.055]",
              ].join(" ")}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                {item.label}
              </div>
              <div className="mt-2 text-3xl font-black text-white">
                {item.value}
              </div>
            </Link>
          );
        })}
      </div>

      <AdminCard>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-white">
              {selectedStatus
                ? `${formatStatus(selectedStatus)} opportunities`
                : "All opportunities"}
            </h2>
            <p className="mt-1 text-sm text-white/50">
              {leads.length} record{leads.length === 1 ? "" : "s"} shown
            </p>
          </div>
          {selectedStatus ? (
            <Link
              href="/admin/expansion-leads"
              className="text-sm font-bold text-emerald-300 transition hover:text-emerald-200"
            >
              Clear filter
            </Link>
          ) : null}
        </div>
      </AdminCard>

      {leads.length ? (
        <div className="grid gap-5 2xl:grid-cols-2">
          {leads.map((lead) => (
            <article
              key={lead.id}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"
            >
              <div className="border-b border-white/10 p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          "inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
                          statusClasses(lead.status),
                        ].join(" ")}
                      >
                        {formatStatus(lead.status)}
                      </span>
                      <span className="inline-flex rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">
                        {formatLeagueType(lead.leagueType)}
                      </span>
                    </div>

                    <h3 className="mt-3 truncate text-2xl font-black tracking-tight text-white">
                      {lead.area || "Area not supplied"}
                    </h3>
                    <p className="mt-1 text-sm text-white/55">
                      Submitted {formatDateTime(lead.createdAt)}
                    </p>
                  </div>

                  <form
                    action={updateExpansionLeadStatusAction}
                    className="flex shrink-0 gap-2"
                  >
                    <input type="hidden" name="leadId" value={lead.id} />
                    <select
                      name="status"
                      defaultValue={lead.status}
                      className="h-10 rounded-xl border border-white/10 bg-black px-3 text-xs font-bold text-white outline-none focus:border-emerald-400"
                    >
                      {Object.values(LeadStatus).map((status) => (
                        <option key={status} value={status}>
                          {formatStatus(status)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="h-10 rounded-xl bg-emerald-500 px-4 text-xs font-extrabold text-black transition hover:bg-emerald-400"
                    >
                      Save
                    </button>
                  </form>
                </div>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
                      Contact
                    </div>
                    <div className="mt-2 font-bold text-white">
                      {lead.contactName}
                    </div>
                    <div className="mt-2 flex flex-col gap-1 text-sm">
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          className="break-all text-emerald-300 transition hover:text-emerald-200"
                        >
                          {lead.email}
                        </a>
                      ) : (
                        <span className="text-white/40">No email</span>
                      )}
                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone}`}
                          className="text-white/70 transition hover:text-white"
                        >
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="text-white/40">No phone</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
                      Opportunity
                    </div>
                    <dl className="mt-2 space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-white/45">Playing nights</dt>
                        <dd className="text-right font-semibold text-white/80">
                          {formatNights(lead.preferredNights)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-white/45">Last updated</dt>
                        <dd className="text-right font-semibold text-white/80">
                          {formatDateTime(lead.updatedAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
                    Full submission
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/70">
                    {lead.message || "No additional details supplied."}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <AdminCard>
          <div className="py-12 text-center">
            <div className="text-4xl">📍</div>
            <h2 className="mt-4 text-xl font-black text-white">
              No expansion opportunities found
            </h2>
            <p className="mt-2 text-sm text-white/50">
              New applications from the public page will appear here.
            </p>
          </div>
        </AdminCard>
      )}
    </div>
  );
}
