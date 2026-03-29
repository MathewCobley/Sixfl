// ========================================
// File: src/app/(admin)/admin/referees/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

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

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function formatStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default async function AdminRefereeProfilePage({ params }: Props) {
  await requireAdmin();

  const { id } = await params;

  const referee = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
      createdFromLeadId: true,
      refereedFixtures: {
        orderBy: [{ kickoffAt: "asc" }],
        select: {
          id: true,
          status: true,
          kickoffAt: true,
          league: {
            select: {
              id: true,
              name: true,
              season: true,
              slug: true,
            },
          },
          homeTeam: {
            select: {
              id: true,
              name: true,
            },
          },
          awayTeam: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!referee || referee.role !== UserRole.REFEREE) {
    return notFound();
  }

  const sourceLead = referee.createdFromLeadId
    ? await prisma.interestLead.findUnique({
        where: { id: referee.createdFromLeadId },
        select: {
          id: true,
          contactName: true,
          email: true,
          phone: true,
          area: true,
          message: true,
          createdAt: true,
          convertedAt: true,
        },
      })
    : null;

  const scheduledFixtures = referee.refereedFixtures.filter(
    (fixture) => fixture.status === "SCHEDULED"
  );
  const completedFixtures = referee.refereedFixtures.filter(
    (fixture) => fixture.status === "COMPLETED"
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Link
            href="/admin/referees"
            className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
          >
            ← Back to referees
          </Link>

          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border border-emerald-500/20 bg-emerald-500/10 text-lg font-black text-emerald-300">
              {getInitials(referee.name, referee.email)}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-black tracking-tight text-white">
                  {referee.name?.trim() || "Unnamed referee"}
                </h1>

                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                  Referee
                </span>
              </div>

              <div className="mt-2 space-y-1 text-sm text-white/65">
                <div>{referee.email || "No email address"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/fixtures"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Manage fixtures
          </Link>

          {sourceLead ? (
            <Link
              href={`/admin/leads/${sourceLead.id}`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400"
            >
              Open source lead
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
            Total fixtures
          </div>
          <div className="mt-2 text-3xl font-black text-white">
            {referee.refereedFixtures.length}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
            Scheduled
          </div>
          <div className="mt-2 text-3xl font-black text-white">
            {scheduledFixtures.length}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
            Completed
          </div>
          <div className="mt-2 text-3xl font-black text-white">
            {completedFixtures.length}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
            Source area
          </div>
          <div className="mt-2 text-sm font-semibold text-white">
            {sourceLead?.area || "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                Fixture assignments
              </div>
              <h2 className="mt-2 text-xl font-bold text-white">
                Referee fixture history
              </h2>
            </div>

            <Link
              href="/admin/fixtures"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Open fixtures
            </Link>
          </div>

          {referee.refereedFixtures.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold text-white">
                No fixtures assigned
              </div>
              <p className="mt-2 text-sm leading-6 text-white/60">
                This referee exists in the live assignment pool but has not yet
                been attached to any fixture.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {referee.refereedFixtures.map((fixture) => (
                <div
                  key={fixture.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
                      {formatStatus(fixture.status)}
                    </span>

                    {fixture.league ? (
                      <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
                        {fixture.league.name}
                        {fixture.league.season ? ` • ${fixture.league.season}` : ""}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 text-lg font-bold text-white">
                    {fixture.homeTeam?.name || "Home"} v{" "}
                    {fixture.awayTeam?.name || "Away"}
                  </div>

                  <div className="mt-2 text-sm text-white/60">
                    {formatDate(fixture.kickoffAt)}
                  </div>

                  {fixture.league?.slug ? (
                    <div className="mt-4">
                      <Link
                        href={`/leagues/${fixture.league.slug}/fixtures`}
                        className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
                      >
                        View public league fixtures →
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_38%),rgba(255,255,255,0.03)] p-5 sm:p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">
              Referee profile
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  Name
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {referee.name || "—"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  Email
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {referee.email || "—"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  Created from lead
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {sourceLead ? "Yes" : "No"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  Converted
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {sourceLead?.convertedAt ? formatDate(sourceLead.convertedAt) : "—"}
                </div>
              </div>
            </div>
          </div>

          {sourceLead ? (
            <div className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                Source lead
              </div>

              <h2 className="mt-2 text-xl font-bold text-white">
                Original referee interest
              </h2>

              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                    Contact name
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {sourceLead.contactName || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                    Phone
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {sourceLead.phone || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                    Area
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {sourceLead.area || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                    Notes
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/75">
                    {sourceLead.message || "—"}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <Link
                  href={`/admin/leads/${sourceLead.id}`}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400"
                >
                  Open lead
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}