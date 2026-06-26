// ========================================
// File: src/app/(admin)/admin/referees/[id]/preview/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  formatMoney,
  formatNightDate,
  getRefereeNightSummaries,
  type RefereeNightStatus,
  type RefereeNightSummary,
} from "@/lib/referee-nights";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function statusClasses(status: RefereeNightStatus) {
  switch (status) {
    case "SUBMITTED":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "APPROVED":
      return "border-sky-400/20 bg-sky-400/10 text-sky-200";
    case "SETTLED":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "REOPENED":
      return "border-violet-400/20 bg-violet-400/10 text-violet-200";
    case "CANCELLED":
      return "border-red-400/20 bg-red-500/10 text-red-200";
    case "DRAFT":
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function formatStatus(status: RefereeNightStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function sortNightSoonestFirst(a: RefereeNightSummary, b: RefereeNightSummary) {
  return a.nightDate.localeCompare(b.nightDate);
}

function StatCard({
  label,
  value,
  text,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  text: string;
  tone?: "emerald" | "amber" | "sky" | "neutral";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/75"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-500/10 text-amber-100/75"
        : tone === "sky"
          ? "border-sky-400/20 bg-sky-500/10 text-sky-100/75"
          : "border-white/10 bg-white/[0.04] text-white/45";

  return (
    <div className={`rounded-3xl border p-5 ${classes}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-5 text-white/55">{text}</p>
    </div>
  );
}

function NightCard({ night, isNext }: { night: RefereeNightSummary; isNext: boolean }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition hover:border-emerald-400/25 hover:bg-white/[0.06]">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(night.status)}`}>
                {formatStatus(night.status)}
              </span>
              {isNext ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                  Next up
                </span>
              ) : null}
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/65">
                {formatNightDate(night.nightDate)}
              </span>
            </div>

            <h2 className="mt-4 text-xl font-semibold leading-tight text-white">
              {night.leagueName}{night.leagueSeason ? ` · ${night.leagueSeason}` : ""}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              {night.venueName || "Venue TBC"} · {night.fixtureCount} fixture{night.fixtureCount === 1 ? "" : "s"}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/referee/night/${night.id}`}
                className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
              >
                Preview night page
              </Link>
              <Link
                href={`/admin/referee-nights/${night.id}`}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                Admin night record
              </Link>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-[440px] lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/35">Fee</div>
              <div className="mt-1 font-semibold text-white">{formatMoney(night.feePence)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/35">Collected</div>
              <div className="mt-1 font-semibold text-white">{formatMoney(night.cashCollectedPence)}</div>
            </div>
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/45">Due SIXFL</div>
              <div className="mt-1 font-semibold text-emerald-100">{formatMoney(night.dueToSixflPence)}</div>
            </div>
            <div className="rounded-2xl border border-amber-400/15 bg-amber-500/10 p-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-amber-100/45">Due to ref</div>
              <div className="mt-1 font-semibold text-amber-100">{formatMoney(night.dueToRefereePence)}</div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function AdminRefereeDashboardPreviewPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  const referee = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  if (!referee || referee.role !== UserRole.REFEREE) {
    notFound();
  }

  const nights = await getRefereeNightSummaries({ refereeId: referee.id });
  const openNights = nights.filter(
    (night) => night.status !== "SETTLED" && night.status !== "CANCELLED",
  );
  const submittedNights = nights.filter((night) => night.status === "SUBMITTED");
  const settledNights = nights.filter((night) => night.status === "SETTLED");
  const dueToSixfl = nights.reduce((sum, night) => sum + night.dueToSixflPence, 0);
  const dueToReferee = nights.reduce((sum, night) => sum + night.dueToRefereePence, 0);
  const totalFixtures = nights.reduce((sum, night) => sum + night.fixtureCount, 0);
  const nextNight = [...openNights].sort(sortNightSoonestFirst)[0] ?? null;
  const refereeName = referee.name || referee.email || "this referee";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold text-white">Admin preview mode</div>
            <p className="mt-1 text-amber-50/80">
              You are previewing the referee dashboard for {refereeName}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/referees"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white transition hover:bg-black/30"
            >
              Back to referees
            </Link>
            <Link
              href={`/admin/referees/${referee.id}`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white transition hover:bg-black/30"
            >
              Open profile
            </Link>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Referee dashboard
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {nextNight ? "Next referee night" : "Referee night preview"}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
              {nextNight
                ? `${nextNight.leagueName}${nextNight.leagueSeason ? ` · ${nextNight.leagueSeason}` : ""}`
                : `${refereeName} has no open referee night right now.`}
            </p>

            {nextNight ? (
              <>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClasses(nextNight.status)}`}>
                    {formatStatus(nextNight.status)}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                    {formatNightDate(nextNight.nightDate)}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                    {nextNight.venueName || "Venue TBC"}
                  </span>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                    {nextNight.fixtureCount} fixture{nextNight.fixtureCount === 1 ? "" : "s"}
                  </span>
                </div>

                <p className="mt-4 text-sm text-white/55">
                  Preview exactly what the referee sees, or open the admin record to assign fixtures, update fees and reconcile cashup.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href={`/referee/night/${nextNight.id}`}
                    className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
                  >
                    Preview next night
                  </Link>
                  <Link
                    href={`/admin/referee-nights/${nextNight.id}`}
                    className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                  >
                    Admin night record
                  </Link>
                </div>
              </>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <StatCard label="Open nights" value={openNights.length} text="Ready for score entry or cashup." tone="emerald" />
            <StatCard label="Submitted" value={submittedNights.length} text="Waiting for SIXFL review." tone="amber" />
            <StatCard label="Due SIXFL" value={formatMoney(dueToSixfl)} text="Cash to reconcile." tone="sky" />
            <StatCard label="Due to ref" value={formatMoney(dueToReferee)} text="Outstanding referee balance." tone="neutral" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Fixtures assigned" value={totalFixtures} text={`Across ${nights.length} referee night${nights.length === 1 ? "" : "s"}.`} tone="neutral" />
        <StatCard label="Settled nights" value={settledNights.length} text="Completed and reconciled." tone="emerald" />
        <Link
          href={nextNight ? `/admin/referee-nights/${nextNight.id}` : `/admin/referees/${referee.id}`}
          className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 transition hover:bg-emerald-500/15"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Admin action
          </p>
          <p className="mt-3 text-2xl font-semibold text-white">
            {nextNight ? "Manage next night" : "Open referee profile"}
          </p>
          <p className="mt-2 text-sm leading-5 text-emerald-100/70">
            {nextNight ? "Assign matches, update fees and review cashup." : "Check profile and night assignment details."}
          </p>
        </Link>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Assigned nights
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Night schedule</h2>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">
            {nights.length} total
          </div>
        </div>

        {nights.length === 0 ? (
          <div className="px-6 py-10 text-sm text-white/55">
            No referee nights are assigned yet. Once SIXFL assigns this referee to a night, it will appear here.
          </div>
        ) : (
          <div className="space-y-4 p-5">
            {nights.map((night) => (
              <NightCard key={night.id} night={night} isNext={nextNight?.id === night.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
