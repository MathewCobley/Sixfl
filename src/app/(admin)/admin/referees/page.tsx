// ========================================
// File: src/app/(admin)/admin/referees/page.tsx
// ========================================

import Link from "next/link";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  formatMoney,
  getRefereeProfilesByUserIds,
} from "@/lib/referees/profile";
import { createRefereeAction, sendRefereeInviteAction } from "./actions";

type SearchParams = Promise<{
  q?: string;
  referee?: string;
  invite?: string;
  error?: string;
  userId?: string;
}>;

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "R";
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function normaliseUkPhoneForHref(phone?: string | null) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.startsWith("0")) return `+44${digits.slice(1)}`;
  return `+${digits}`;
}

function buildWhatsAppHref(phone?: string | null) {
  const normalised = normaliseUkPhoneForHref(phone);
  if (!normalised) return null;
  return `https://wa.me/${normalised.replace(/\D/g, "")}`;
}

function ContactButton({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;

  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
    >
      {label}
    </a>
  );
}

function getErrorMessage(error?: string) {
  switch (error) {
    case "missing_referee_details":
      return "Please enter at least a name and email address for the referee.";
    case "invalid_referee_email":
      return "Please enter a valid referee email address.";
    case "missing_referee_email":
      return "That referee needs an email address before an invite can be sent.";
    case "invalid_referee_phone":
      return "Please enter a valid UK mobile number for SMS, for example 07700 900123.";
    case "invalid_referee_fee":
      return "Please enter the referee fee as a pounds amount, for example 45 or 45.00.";
    case "invite_not_queued":
      return "The referee invite email could not be queued. Check the email address and notification settings.";
    case "admin_user_already_assignable":
      return "That email belongs to an admin user. Admin users can already be assigned to referee nights.";
    case "missing_referee":
      return "That referee could not be found.";
    default:
      return null;
  }
}

export default async function AdminRefereesPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const query = String(sp.q ?? "").trim();
  const errorMessage = getErrorMessage(sp.error);
  const successMessage = sp.invite === "queued"
    ? "Referee invite email queued through the SIXFL notification system."
    : sp.referee
      ? sp.referee === "updated"
        ? "Referee updated and added to the live referee list."
        : "Referee added to the live referee list."
      : null;

  const referees = await prisma.user.findMany({
    where: {
      role: UserRole.REFEREE,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdFromLeadId: true,
      refereedFixtures: {
        select: {
          id: true,
          status: true,
          kickoffAt: true,
          league: { select: { id: true, name: true, season: true } },
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
        orderBy: [{ kickoffAt: "asc" }],
      },
    },
  });

  const [profileMap, leads] = await Promise.all([
    getRefereeProfilesByUserIds(referees.map((referee) => referee.id)),
    (() => {
      const convertedLeadIds = referees
        .map((referee) => referee.createdFromLeadId)
        .filter((value): value is string => Boolean(value));

      return convertedLeadIds.length
        ? prisma.interestLead.findMany({
            where: { id: { in: convertedLeadIds } },
            select: {
              id: true,
              contactName: true,
              email: true,
              phone: true,
              area: true,
              createdAt: true,
              convertedAt: true,
            },
          })
        : [];
    })(),
  ]);

  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const totalReferees = referees.length;
  const activeReferees = referees.filter((referee) => profileMap.get(referee.id)?.isActive !== false).length;
  const withFeeCount = referees.filter((referee) => (profileMap.get(referee.id)?.standardNightFeePence ?? 0) > 0).length;
  const totalAssignments = referees.reduce((sum, referee) => sum + referee.refereedFixtures.length, 0);
  const activeAssignments = referees.reduce(
    (sum, referee) => sum + referee.refereedFixtures.filter((fixture) => fixture.status === "SCHEDULED").length,
    0,
  );

  const statCards = [
    { label: "Total referees", value: totalReferees, helper: "Live referee users" },
    { label: "Active", value: activeReferees, helper: "Marked active for admin" },
    { label: "Fee saved", value: withFeeCount, helper: "With a standard night fee" },
    { label: "Scheduled now", value: activeAssignments, helper: "Upcoming scheduled appointments" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Referees
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Manage referee users
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-white/60 sm:text-base">
            Edit referee contact details, record their standard night fee and send invite emails or SMS messages through the SIXFL notification system.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/leads?type=REFEREE" className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10">
            Referee leads
          </Link>
          <Link href="/admin/referee-nights" className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/15">
            Referee nights
          </Link>
          <Link href="/admin/messaging" className="inline-flex h-11 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/15">
            SMS inbox
          </Link>
          <Link href="/admin/fixtures" className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10">
            Open fixtures
          </Link>
        </div>
      </div>

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {errorMessage}
        </div>
      ) : null}

      <details className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-emerald-400/10 shadow-[0_20px_70px_rgba(0,0,0,0.3)]">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/10 sm:px-6">
          + Add referee
        </summary>
        <form action={createRefereeAction} className="grid gap-4 border-t border-emerald-400/15 bg-black/20 px-5 py-5 sm:grid-cols-2 sm:px-6 xl:grid-cols-[1fr_1fr_0.75fr_0.7fr_0.65fr_auto]">
          <input
            name="name"
            required
            placeholder="Referee name"
            className="h-12 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none placeholder:text-white/35"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="Email address"
            className="h-12 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none placeholder:text-white/35"
          />
          <input
            name="phone"
            placeholder="Mobile for SMS"
            className="h-12 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none placeholder:text-white/35"
          />
          <input
            name="area"
            placeholder="Area"
            className="h-12 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none placeholder:text-white/35"
          />
          <input
            name="standardNightFee"
            inputMode="decimal"
            placeholder="Fee e.g. 45"
            className="h-12 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none placeholder:text-white/35"
          />
          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300">
            Add referee
          </button>
        </form>
      </details>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">{card.label}</div>
            <div className="mt-2 text-3xl font-black text-white">{card.value}</div>
            <div className="mt-1 text-sm text-white/55">{card.helper}</div>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_38%),rgba(255,255,255,0.03)] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.35)] sm:p-5">
        <form className="flex flex-col gap-3 md:flex-row" action="/admin/referees">
          <input type="text" name="q" defaultValue={query} placeholder="Search by referee name or email" className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/35" />
          <div className="flex gap-3">
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-500 px-5 text-sm font-semibold text-black transition hover:bg-emerald-400">Search</button>
            <Link href="/admin/referees" className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10">Clear</Link>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        {referees.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
            <h2 className="text-lg font-bold text-white">No referees found</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">Convert a referee lead first, or add a referee above.</p>
          </div>
        ) : (
          referees.map((referee) => {
            const profile = profileMap.get(referee.id) ?? null;
            const sourceLead = referee.createdFromLeadId ? leadMap.get(referee.createdFromLeadId) ?? null : null;
            const nextFixture = referee.refereedFixtures.find((fixture) => fixture.status === "SCHEDULED") ?? referee.refereedFixtures[0] ?? null;
            const contactEmail = referee.email || sourceLead?.email || null;
            const contactPhone = profile?.phone || sourceLead?.phone || null;
            const phoneHref = normaliseUkPhoneForHref(contactPhone);
            const whatsappHref = buildWhatsAppHref(contactPhone);
            const isActive = profile?.isActive !== false;

            return (
              <div key={referee.id} className="overflow-hidden rounded-3xl border border-white/10 bg-black/25 shadow-[0_18px_70px_rgba(0,0,0,0.28)]">
                <div className="grid gap-0 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-sm font-black text-emerald-300">{getInitials(referee.name, referee.email)}</div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-xl font-bold text-white">{referee.name?.trim() || "Unnamed referee"}</h2>
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">Referee</span>
                            <span className={["rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em]", isActive ? "border-sky-400/20 bg-sky-400/10 text-sky-200" : "border-red-400/20 bg-red-400/10 text-red-200"].join(" ")}>{isActive ? "Active" : "Inactive"}</span>
                            {sourceLead ? <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">From lead</span> : null}
                          </div>
                          <div className="mt-2 space-y-1 text-sm text-white/65">
                            <div>{contactEmail || "No email address"}</div>
                            <div>{contactPhone || "No phone number"}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/admin/referees/${referee.id}`} className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400">Edit referee</Link>
                        <Link href={`/admin/referees/${referee.id}#comms`} className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15">Comms</Link>
                        {contactEmail ? (
                          <form action={sendRefereeInviteAction}>
                            <input type="hidden" name="refereeId" value={referee.id} />
                            <button type="submit" className="inline-flex h-10 items-center justify-center rounded-xl bg-purple-300 px-4 text-sm font-semibold text-black transition hover:bg-purple-200">
                              Send invite
                            </button>
                          </form>
                        ) : null}
                        <Link href={`/admin/referees/${referee.id}#comms`} className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-300 px-4 text-sm font-semibold text-black transition hover:bg-sky-200">Send SMS via SIXFL</Link>
                        <Link href={`/admin/referees/${referee.id}/preview`} className="inline-flex h-10 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-300/10 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-300/15">Preview dashboard</Link>
                        {sourceLead ? <Link href={`/admin/leads/${sourceLead.id}`} className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400">Email via SIXFL</Link> : null}
                        <ContactButton href={whatsappHref} label="WhatsApp" />
                        <ContactButton href={phoneHref ? `tel:${phoneHref}` : null} label="Call" />
                        {sourceLead ? <Link href={`/admin/leads/${sourceLead.id}`} className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10">Open lead</Link> : null}
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-4">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Total fixtures</div><div className="mt-2 text-2xl font-black text-white">{referee.refereedFixtures.length}</div></div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Standard night fee</div><div className="mt-2 text-sm font-semibold text-white">{formatMoney(profile?.standardNightFeePence)}</div></div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Source area</div><div className="mt-2 text-sm font-semibold text-white">{sourceLead?.area || "—"}</div></div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">SMS phone</div><div className="mt-2 text-sm font-semibold text-white">{contactPhone || "—"}</div></div>
                    </div>
                  </div>
                  <div className="border-t border-white/10 bg-white/[0.02] p-5 xl:border-l xl:border-t-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Next assignment</div>
                    <div className="mt-1 text-sm text-white/60">Earliest linked fixture for this referee.</div>
                    {nextFixture ? (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{nextFixture.status}</span>{nextFixture.league ? <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{nextFixture.league.name}{nextFixture.league.season ? ` • ${nextFixture.league.season}` : ""}</span> : null}</div>
                        <div className="mt-3 text-lg font-bold text-white">{nextFixture.homeTeam?.name || "Home"} v {nextFixture.awayTeam?.name || "Away"}</div>
                        <div className="mt-2 text-sm text-white/60">{formatDate(nextFixture.kickoffAt)}</div>
                        <div className="mt-4"><Link href="/admin/fixtures" className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10">Manage fixtures</Link></div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-4"><div className="text-sm font-semibold text-white">No fixtures assigned yet</div><p className="mt-2 text-sm leading-6 text-white/60">This referee is live in the system but has not yet been attached to any fixture.</p></div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
