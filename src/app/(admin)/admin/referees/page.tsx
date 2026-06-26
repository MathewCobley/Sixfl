// ========================================
// File: src/app/(admin)/admin/referees/page.tsx
// ========================================

import Link from "next/link";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type SearchParams = Promise<{ q?: string }>;

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(value);
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

export default async function AdminRefereesPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const query = String(sp.q ?? "").trim();

  const referees = await prisma.user.findMany({
    where: {
      role: UserRole.REFEREE,
      ...(query
        ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] }
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

  const convertedLeadIds = referees.map((referee) => referee.createdFromLeadId).filter((value): value is string => Boolean(value));

  const leads = convertedLeadIds.length
    ? await prisma.interestLead.findMany({
        where: { id: { in: convertedLeadIds } },
        select: { id: true, contactName: true, email: true, phone: true, area: true, createdAt: true, convertedAt: true },
      })
    : [];

  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const totalReferees = referees.length;
  const withLeadCount = referees.filter((referee) => Boolean(referee.createdFromLeadId)).length;
  const totalAssignments = referees.reduce((sum, referee) => sum + referee.refereedFixtures.length, 0);
  const activeAssignments = referees.reduce(
    (sum, referee) => sum + referee.refereedFixtures.filter((fixture) => fixture.status === "SCHEDULED").length,
    0,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Referees</div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Manage referee users</h1>
          <p className="max-w-3xl text-sm leading-7 text-white/60 sm:text-base">
            This is the live referee user directory used by fixtures. Email converted referee leads through the existing lead email flow so templates, previews, signatures and history stay in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/leads?type=REFEREE" className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10">Referee leads</Link>
          <Link href="/admin/fixtures" className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10">Open fixtures</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Total referees", totalReferees, "Live assignable referee users"], ["From leads", withLeadCount, "Converted from referee interest"], ["Total assignments", totalAssignments, "Fixtures linked to referees"], ["Scheduled now", activeAssignments, "Upcoming scheduled appointments"]].map(([label, value, helper]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">{label}</div>
            <div className="mt-2 text-3xl font-black text-white">{value}</div>
            <div className="mt-1 text-sm text-white/55">{helper}</div>
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
            <p className="mt-2 text-sm leading-6 text-white/60">Convert a referee lead first, or adjust your search.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/admin/leads?type=REFEREE" className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400">Open referee leads</Link>
              <Link href="/admin/fixtures" className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10">Open fixtures</Link>
            </div>
          </div>
        ) : (
          referees.map((referee) => {
            const sourceLead = referee.createdFromLeadId ? leadMap.get(referee.createdFromLeadId) ?? null : null;
            const nextFixture = referee.refereedFixtures.find((fixture) => fixture.status === "SCHEDULED") ?? referee.refereedFixtures[0] ?? null;
            const contactEmail = referee.email || sourceLead?.email || null;
            const contactPhone = sourceLead?.phone || null;
            const phoneHref = normaliseUkPhoneForHref(contactPhone);
            const whatsappHref = buildWhatsAppHref(contactPhone);

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
                            {sourceLead ? <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">From lead</span> : null}
                          </div>
                          <div className="mt-2 space-y-1 text-sm text-white/65">
                            <div>{contactEmail || "No email address"}</div>
                            <div>{contactPhone || "No phone number"}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sourceLead ? <Link href={`/admin/leads/${sourceLead.id}`} className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400">Email via SIXFL</Link> : null}
                        <ContactButton href={whatsappHref} label="WhatsApp" />
                        <ContactButton href={phoneHref ? `tel:${phoneHref}` : null} label="Call" />
                        <ContactButton href={phoneHref ? `sms:${phoneHref}` : null} label="Text" />
                        <Link href={`/admin/referees/${referee.id}`} className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10">Open profile</Link>
                        {sourceLead ? <Link href={`/admin/leads/${sourceLead.id}`} className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10">Open lead</Link> : null}
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Total fixtures</div><div className="mt-2 text-2xl font-black text-white">{referee.refereedFixtures.length}</div></div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Source area</div><div className="mt-2 text-sm font-semibold text-white">{sourceLead?.area || "—"}</div></div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Source phone</div><div className="mt-2 text-sm font-semibold text-white">{contactPhone || "—"}</div></div>
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
                      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-4"><div className="text-sm font-semibold text-white">No fixtures assigned yet</div><p className="mt-2 text-sm leading-6 text-white/60">This referee is live in the system but has not yet been attached to any fixtures.</p></div>
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
