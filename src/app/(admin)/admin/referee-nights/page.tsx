// ========================================
// File: src/app/(admin)/admin/referee-nights/page.tsx
// ========================================

import Link from "next/link";
import { Prisma, UserRole } from "@prisma/client";
import { ensureRefereeNightConfirmationColumns } from "@/lib/referee-night-confirmations";
import { getCurrentLeagueIds } from "@/lib/current-leagues";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  formatMoney,
  formatNightDate,
  getRefereeNightSummaries,
  type RefereeNightStatus,
} from "@/lib/referee-nights";
import { getRefereeProfilesByUserIds } from "@/lib/referees/profile";
import FormListboxField from "@/components/ui/FormListboxField";
import { chaseRefereeNightConfirmationAction, createRefereeNightAction } from "./actions";

type ConfirmationInfo = {
  id: string;
  confirmationStatus: string | null;
  confirmationSentAt: Date | null;
  confirmationLastChasedAt: Date | null;
  confirmationConfirmedAt: Date | null;
  confirmationDeclinedAt: Date | null;
  confirmationResponseNote: string | null;
};

function statusClasses(status: RefereeNightStatus) {
  switch (status) {
    case "SUBMITTED":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "APPROVED":
      return "border-sky-400/20 bg-sky-400/10 text-sky-200";
    case "SETTLED":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "CANCELLED":
      return "border-red-400/20 bg-red-500/10 text-red-200";
    case "REOPENED":
      return "border-violet-400/20 bg-violet-400/10 text-violet-200";
    case "DRAFT":
    default:
      return "border-white/10 bg-white/[0.05] text-white/70";
  }
}

function confirmationClasses(status?: string | null) {
  switch (status) {
    case "CONFIRMED":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "DECLINED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    case "PENDING":
    default:
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  }
}

function formatStatus(status: RefereeNightStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatConfirmationStatus(status?: string | null) {
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "DECLINED") return "Declined";
  return "Pending";
}

function formatDateTime(value?: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function confirmationDetail(info?: ConfirmationInfo | null) {
  if (!info) return "Booking pending — waits 60 minutes after the last assignment change";
  if (info.confirmationStatus === "CONFIRMED") return `Confirmed ${formatDateTime(info.confirmationConfirmedAt)}`;
  if (info.confirmationStatus === "DECLINED") return `Declined ${formatDateTime(info.confirmationDeclinedAt)}`;
  if (info.confirmationLastChasedAt) return `Last communication queued ${formatDateTime(info.confirmationLastChasedAt)}`;
  if (info.confirmationSentAt) return `Sent ${formatDateTime(info.confirmationSentAt)}`;
  return "Booking pending — waits 60 minutes after the last assignment change";
}

async function getConfirmationMap(nightIds: string[]) {
  if (nightIds.length === 0) return new Map<string, ConfirmationInfo>();

  await ensureRefereeNightConfirmationColumns();

  const rows = await prisma.$queryRaw<ConfirmationInfo[]>(Prisma.sql`
    SELECT
      id,
      "confirmationStatus",
      "confirmationSentAt",
      "confirmationLastChasedAt",
      "confirmationConfirmedAt",
      "confirmationDeclinedAt",
      "confirmationResponseNote"
    FROM "RefereeNight"
    WHERE id IN (${Prisma.join(nightIds)})
  `);

  return new Map(rows.map((row) => [row.id, row]));
}

export default async function AdminRefereeNightsPage({
  searchParams,
}: {
  searchParams?: Promise<{ chased?: string }>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const currentLeagueIds = await getCurrentLeagueIds();
  const [nights, referees, leagues, venues] = await Promise.all([
    getRefereeNightSummaries(),
    prisma.user.findMany({
      where: {
        role: {
          in: [UserRole.REFEREE, UserRole.ADMIN],
        },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.league.findMany({
      where: { id: { in: currentLeagueIds } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
      select: { id: true, name: true, season: true },
    }),
    prisma.venue.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const confirmationMap = await getConfirmationMap(nights.map((night) => night.id));
  const visibleNights = nights.filter((night) => !(night.status === "DRAFT" && night.fixtureCount === 0));
  const emptyDraftNights = nights.filter((night) => night.status === "DRAFT" && night.fixtureCount === 0);

  const refereeProfileMap = await getRefereeProfilesByUserIds(referees.map((referee) => referee.id));
  const refereeOptions = referees.map((referee) => {
    const profile = refereeProfileMap.get(referee.id);
    const feeLabel = profile?.standardNightFeePence
      ? ` · standard ${formatMoney(profile.standardNightFeePence)}`
      : "";
    const activeLabel = profile?.isActive === false ? " · inactive" : "";

    return {
      value: referee.id,
      label: `${referee.name || referee.email || "Unnamed referee"}${referee.role === "ADMIN" ? " · admin" : ""}${feeLabel}${activeLabel}`,
    };
  });
  const leagueOptions = leagues.map((league) => ({
    value: league.id,
    label: `${league.name}${league.season ? ` · ${league.season}` : ""}`,
  }));
  const venueOptions = venues.map((venue) => ({
    value: venue.id,
    label: venue.name,
  }));

  const submittedCount = visibleNights.filter((night) => night.status === "SUBMITTED").length;
  const unsettledCount = visibleNights.filter(
    (night) => night.status !== "SETTLED" && night.status !== "CANCELLED",
  ).length;
  const dueToSixfl = visibleNights.reduce((sum, night) => sum + night.dueToSixflPence, 0);
  const dueToReferees = visibleNights.reduce((sum, night) => sum + night.dueToRefereePence, 0);
  const confirmedCount = visibleNights.filter((night) => confirmationMap.get(night.id)?.confirmationStatus === "CONFIRMED").length;
  const declinedCount = visibleNights.filter((night) => confirmationMap.get(night.id)?.confirmationStatus === "DECLINED").length;
  const pendingCount = Math.max(0, visibleNights.length - confirmedCount - declinedCount);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
              Referee confirmations
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Referee confirmations & cashup
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
              Use the Night Board to organise fixtures. Use this page to confirm each referee will attend, chase them if needed, and settle cashup after the night. Manual referee nights are linked to a current league season.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Active nights</div>
              <div className="mt-1 text-lg font-semibold text-white">{visibleNights.length}</div>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/70">Need confirm</div>
              <div className="mt-1 text-lg font-semibold text-white">{pendingCount}</div>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Confirmed</div>
              <div className="mt-1 text-lg font-semibold text-white">{confirmedCount}</div>
            </div>
            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-100/70">Declined</div>
              <div className="mt-1 text-lg font-semibold text-white">{declinedCount}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Due refs</div>
              <div className="mt-1 text-lg font-semibold text-white">{formatMoney(dueToReferees)}</div>
            </div>
          </div>
        </div>
      </section>

      {sp.chased ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Evening booking schedule checked. One settled booking email and one later SMS are used; duplicate alerts are suppressed.
        </div>
      ) : null}

      <section className="grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Confirmation ledger</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Referee nights</h2>
              </div>
              <div className="text-sm text-white/45">{unsettledCount} open or submitted · {submittedCount} submitted</div>
            </div>
          </div>

          {visibleNights.length === 0 ? (
            <div className="px-6 py-8 text-sm text-white/60">No active referee nights with fixtures yet.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {visibleNights.map((night) => {
                const confirmation = confirmationMap.get(night.id);
                const isClosed = confirmation?.confirmationStatus === "CONFIRMED" || confirmation?.confirmationStatus === "DECLINED" || night.status === "SETTLED" || night.status === "CANCELLED";

                return (
                  <div key={night.id} className="px-6 py-5 transition hover:bg-white/[0.04]">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <Link href={`/admin/referee-nights/${night.id}`} className="block min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(night.status)}`}>
                            {formatStatus(night.status)}
                          </span>
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${confirmationClasses(confirmation?.confirmationStatus)}`}>
                            {formatConfirmationStatus(confirmation?.confirmationStatus)}
                          </span>
                          <span className="text-sm text-white/50">{formatNightDate(night.nightDate)}</span>
                        </div>
                        <h3 className="mt-3 text-lg font-semibold text-white">
                          {night.refereeName || night.refereeEmail || "Unnamed referee"}
                        </h3>
                        <p className="mt-1 text-sm text-white/55">
                          {night.leagueName}{night.leagueSeason ? ` · ${night.leagueSeason}` : ""}{night.venueName ? ` · ${night.venueName}` : ""}
                        </p>
                        <p className="mt-2 text-xs text-white/45">{confirmationDetail(confirmation)}</p>
                      </Link>

                      <div className="grid min-w-[320px] grid-cols-2 gap-3 text-sm sm:grid-cols-4 xl:w-[420px]">
                        <div><div className="text-white/35">Fixtures</div><div className="font-semibold text-white">{night.fixtureCount}</div></div>
                        <div><div className="text-white/35">Fee</div><div className="font-semibold text-white">{formatMoney(night.feePence)}</div></div>
                        <div><div className="text-white/35">Collected</div><div className="font-semibold text-white">{formatMoney(night.cashCollectedPence)}</div></div>
                        <div><div className="text-white/35">Due SIXFL</div><div className="font-semibold text-white">{formatMoney(night.dueToSixflPence)}</div></div>
                      </div>

                      <form action={chaseRefereeNightConfirmationAction} className="flex gap-2 xl:justify-end">
                        <input type="hidden" name="refereeNightId" value={night.id} />
                        <input type="hidden" name="returnTo" value="/admin/referee-nights" />
                        <button
                          type="submit"
                          disabled={isClosed}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
                        >
                          Check booking
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <details className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <summary className="cursor-pointer border-b border-white/10 px-6 py-5 text-white">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Manual setup</span>
              <span className="mt-2 block text-2xl font-semibold">Create referee night</span>
              <span className="mt-2 block text-sm leading-6 text-white/55">Usually the Night Board creates this automatically. Use this only for manual corrections.</span>
            </summary>

            <form action={createRefereeNightAction} className="space-y-5 px-6 py-6">
              <div>
                <div className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Referee</div>
                <FormListboxField name="refereeId" options={refereeOptions} placeholder="Choose referee" />
              </div>

              <div>
                <div className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">League season</div>
                <FormListboxField name="leagueId" options={leagueOptions} placeholder="Choose current season" />
              </div>

              <div>
                <div className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Venue</div>
                <FormListboxField name="venueId" options={venueOptions} placeholder="Any venue for this season/date" />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Night date</label>
                  <input type="date" name="nightDate" required className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none" />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Night fee (£)</label>
                  <input type="number" name="feePounds" step="0.01" min="0" placeholder="Blank = saved standard fee" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none" />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Admin notes</label>
                <textarea name="adminNotes" rows={3} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none" placeholder="Optional notes for the night" />
              </div>

              <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">
                Create referee night
              </button>
            </form>
          </details>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Empty drafts</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Needs cleanup</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              Empty draft nights have no assigned fixtures. They are hidden from the main ledger so they do not get mistaken for live referee cover.
            </p>
            <div className="mt-4 text-3xl font-semibold text-white">{emptyDraftNights.length}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
