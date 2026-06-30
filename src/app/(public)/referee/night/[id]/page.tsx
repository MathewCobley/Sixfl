// ========================================
// File: src/app/(public)/referee/night/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma, UserRole } from "@prisma/client";
import DisciplinaryNoteForm from "@/components/referee/DisciplinaryNoteForm";
import RefereeCashupSubmitFeedback from "@/components/referee/RefereeCashupSubmitFeedback";
import { requireReferee } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import {
  formatKickoffTime,
  formatMoney,
  formatNightDate,
  getCashCollectedByTeam,
  getRefereeNightById,
  getRefereeNightFixtures,
  type RefereeNightStatus,
} from "@/lib/referee-nights";
import {
  recordRefereeNightCashAction,
  submitNightFixtureResultAction,
  submitRefereeNightCashupAction,
} from "../../actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string; submitted?: string }>;
};

type DisciplinaryNoteRow = {
  id: string;
  fixtureId: string;
  teamId: string;
  incidentType: string;
  severity: string;
  description: string;
  createdAt: Date;
  teamName: string;
  reportedByName: string | null;
  reportedByEmail: string | null;
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
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }
}

function formatStatus(status: RefereeNightStatus) {
  if (status === "DRAFT") return "Scheduled";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function isNightLocked(status: RefereeNightStatus) {
  return ["SUBMITTED", "APPROVED", "SETTLED", "CANCELLED"].includes(status);
}

function getLockedMessage(status: RefereeNightStatus) {
  switch (status) {
    case "SUBMITTED":
      return "This night has been submitted to SIXFL admin. Scores, cash and notes are now locked unless admin reopens it.";
    case "APPROVED":
      return "This night has been approved by SIXFL admin. The referee view is locked.";
    case "SETTLED":
      return "This night has been settled. The referee view is locked.";
    case "CANCELLED":
      return "This referee night has been cancelled.";
    default:
      return null;
  }
}

function formatDisciplinaryIncident(value: string) {
  switch (value) {
    case "DISSENT":
      return "Dissent";
    case "FIGHTING":
      return "Fighting / violent conduct";
    case "AGGRESSIVE_CONDUCT":
      return "Aggressive conduct";
    case "OFFENSIVE_LANGUAGE":
      return "Offensive language";
    case "THREATENING_BEHAVIOUR":
      return "Threatening behaviour";
    default:
      return "Other";
  }
}

function formatDisciplinarySeverity(value: string) {
  switch (value) {
    case "WARNING":
      return "Warning";
    case "SERIOUS":
      return "Serious";
    case "URGENT":
      return "Urgent";
    default:
      return "Note";
  }
}

function severityClasses(value: string) {
  switch (value) {
    case "URGENT":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    case "SERIOUS":
      return "border-orange-400/25 bg-orange-500/10 text-orange-100";
    case "WARNING":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    default:
      return "border-white/10 bg-white/[0.04] text-white/60";
  }
}

function getSavedMessage(saved?: string, submitted?: string) {
  if (submitted === "1") return "Cashup submitted and locked. SIXFL admin will now review it.";

  switch (saved) {
    case "result":
      return "Score saved.";
    case "cash":
      return "Cash collected recorded.";
    case "discipline":
      return "Disciplinary note recorded.";
    default:
      return null;
  }
}

function groupDisciplinaryNotesByFixture(notes: DisciplinaryNoteRow[]) {
  const grouped = new Map<string, DisciplinaryNoteRow[]>();

  for (const note of notes) {
    grouped.set(note.fixtureId, [...(grouped.get(note.fixtureId) ?? []), note]);
  }

  return grouped;
}

function CashForm({
  refereeNightId,
  fixtureId,
  teamId,
  teamName,
}: {
  refereeNightId: string;
  fixtureId: string;
  teamId: string;
  teamName: string;
}) {
  return (
    <form action={recordRefereeNightCashAction} className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <input type="hidden" name="refereeNightId" value={refereeNightId} />
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="method" value="CASH" />
      <div className="text-sm font-semibold text-white">{teamName}</div>
      <div className="mt-3">
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
          Cash collected
        </label>
        <input
          name="amountPounds"
          type="number"
          min="0"
          step="0.01"
          placeholder="Collected £"
          className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-base text-white outline-none placeholder:text-white/35 sm:h-11 sm:text-sm"
        />
      </div>
      <input
        name="notes"
        placeholder="Optional note"
        className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-base text-white outline-none placeholder:text-white/35 sm:h-11 sm:text-sm"
      />
      <button type="submit" className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/15 sm:h-10 sm:w-auto">
        Record cash
      </button>
    </form>
  );
}

export default async function RefereeNightPage({ params, searchParams }: PageProps) {
  const { user, isAdminPreview } = await requireReferee();
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const [night, fixtures, cashByTeam] = await Promise.all([
    getRefereeNightById(id),
    getRefereeNightFixtures(id),
    getCashCollectedByTeam(id),
  ]);

  if (!night) notFound();

  const canAccess = user.role === UserRole.ADMIN || night.refereeId === user.id;
  if (!canAccess) notFound();

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const disciplinaryNotes = fixtureIds.length
    ? await prisma.$queryRaw<DisciplinaryNoteRow[]>(Prisma.sql`
        SELECT
          note.id,
          note."fixtureId",
          note."teamId",
          note."incidentType"::text AS "incidentType",
          note."severity"::text AS "severity",
          note.description,
          note."createdAt",
          team.name AS "teamName",
          reporter.name AS "reportedByName",
          reporter.email AS "reportedByEmail"
        FROM "FixtureDisciplinaryNote" note
        JOIN "Team" team ON team.id = note."teamId"
        LEFT JOIN "User" reporter ON reporter.id = note."reportedByUserId"
        WHERE note."fixtureId" IN (${Prisma.join(fixtureIds)})
        ORDER BY note."createdAt" DESC
      `)
    : [];
  const disciplinaryNotesByFixture = groupDisciplinaryNotesByFixture(disciplinaryNotes);
  const allFixturesHaveResults = fixtures.length > 0 && fixtures.every((fixture) => fixture.result);
  const savedMessage = getSavedMessage(sp.saved, sp.submitted);
  const locked = isNightLocked(night.status);
  const lockedMessage = getLockedMessage(night.status);

  return (
    <div className="min-h-screen bg-black px-4 pb-28 pt-4 text-white sm:px-6 sm:py-6 lg:px-8">
      <RefereeCashupSubmitFeedback />
      <div className="mx-auto max-w-6xl space-y-5 sm:space-y-8">
        {isAdminPreview ? (
          <section className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5 text-sm text-amber-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-white">Referee preview mode</div>
                <p className="mt-1 text-amber-50/80">
                  You are seeing this night as {user.name || user.email || "this referee"}.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/referees/${user.id}/referee-preview/exit?to=${encodeURIComponent(`/admin/referee-nights/${night.id}`)}`}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white transition hover:bg-black/30"
                >
                  Switch back to admin view
                </Link>
                <Link
                  href={`/admin/referee-nights/${night.id}`}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white transition hover:bg-black/30"
                >
                  Admin night record
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        {savedMessage ? (
          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {savedMessage}
          </section>
        ) : null}

        {lockedMessage ? (
          <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {lockedMessage}
          </section>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:p-6 md:p-8">
          <Link href="/referee" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">← Referee dashboard</Link>
          <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(night.status)}`}>{formatStatus(night.status)}</span>
            <span className="text-sm text-white/55">{formatNightDate(night.nightDate)}</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
            {night.leagueName}{night.leagueSeason ? ` · ${night.leagueSeason}` : ""}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
            {night.venueName || "Venue TBC"} · {fixtures.length} fixture{fixtures.length === 1 ? "" : "s"}. {locked ? "This cashup has been submitted and is locked." : "Save scores first, then record cash or notes only where needed."}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-2 sm:gap-3 lg:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:px-4"><div className="text-[10px] uppercase tracking-[0.16em] text-white/40 sm:text-[11px]">Night fee</div><div className="mt-1 text-base font-semibold text-white sm:text-lg">{formatMoney(night.feePence)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:px-4"><div className="text-[10px] uppercase tracking-[0.16em] text-white/40 sm:text-[11px]">Collected</div><div className="mt-1 text-base font-semibold text-white sm:text-lg">{formatMoney(night.cashCollectedPence)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:px-4"><div className="text-[10px] uppercase tracking-[0.16em] text-white/40 sm:text-[11px]">You keep</div><div className="mt-1 text-base font-semibold text-white sm:text-lg">{formatMoney(night.retainedByRefereePence)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:px-4"><div className="text-[10px] uppercase tracking-[0.16em] text-white/40 sm:text-[11px]">Owe SIXFL</div><div className="mt-1 text-base font-semibold text-emerald-200 sm:text-lg">{formatMoney(night.dueToSixflPence)}</div></div>
            <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:col-span-1 sm:px-4"><div className="text-[10px] uppercase tracking-[0.16em] text-white/40 sm:text-[11px]">SIXFL owes you</div><div className="mt-1 text-base font-semibold text-amber-200 sm:text-lg">{formatMoney(night.dueToRefereePence)}</div></div>
          </div>
        </section>

        {fixtures.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/60">
            No fixtures are attached to this referee night yet.
          </div>
        ) : (
          <section className="space-y-4 sm:space-y-5">
            {fixtures.map((fixture, fixtureIndex) => {
              const homeCollected = cashByTeam[fixture.homeTeam.id] ?? 0;
              const awayCollected = cashByTeam[fixture.awayTeam.id] ?? 0;
              const fixtureDisciplinaryNotes = disciplinaryNotesByFixture.get(fixture.id) ?? [];
              const fixtureLabel = `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`;

              return (
                <article key={fixture.id} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
                  <div className="border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">Match {fixtureIndex + 1}</span>
                          <span>{formatKickoffTime(fixture.kickoffAt)}</span>
                          {fixture.pitch ? <><span>•</span><span>{fixture.pitch}</span></> : null}
                          {fixture.round ? <><span>•</span><span>Week {fixture.round}</span></> : null}
                        </div>
                        <h2 className="mt-2 text-lg font-semibold leading-tight text-white sm:text-xl">
                          {fixture.homeTeam.name} <span className="text-white/35">v</span> {fixture.awayTeam.name}
                        </h2>
                        <div className="mt-1 text-sm text-white/55">
                          {fixture.result ? `Current result: ${fixture.result.homeScore}-${fixture.result.awayScore}${fixture.result.isDisputed ? " · disputed" : ""}` : "No result entered"}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm sm:gap-3">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="truncate text-white/45">{fixture.homeTeam.name}</div><div className="font-semibold text-emerald-200">{formatMoney(homeCollected)}</div></div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="truncate text-white/45">{fixture.awayTeam.name}</div><div className="font-semibold text-emerald-200">{formatMoney(awayCollected)}</div></div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4 sm:px-6 sm:py-5">
                    {locked ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">1. Score locked</h3>
                        <p className="mt-3 text-sm text-white/65">
                          {fixture.result ? `Final score recorded: ${fixture.result.homeScore}-${fixture.result.awayScore}.` : "No score was recorded before submission."}
                        </p>
                      </div>
                    ) : (
                      <form action={submitNightFixtureResultAction} className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                        <input type="hidden" name="refereeNightId" value={night.id} />
                        <input type="hidden" name="fixtureId" value={fixture.id} />
                        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-100/70">1. Score</h3>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <label className="text-sm text-white/70">
                            <span className="block truncate">{fixture.homeTeam.name}</span>
                            <input name="homeScore" type="number" min="0" step="1" defaultValue={fixture.result?.homeScore ?? 0} className="mt-2 h-14 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-center text-xl font-semibold text-white outline-none sm:h-11 sm:text-base" />
                          </label>
                          <label className="text-sm text-white/70">
                            <span className="block truncate">{fixture.awayTeam.name}</span>
                            <input name="awayScore" type="number" min="0" step="1" defaultValue={fixture.result?.awayScore ?? 0} className="mt-2 h-14 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-center text-xl font-semibold text-white outline-none sm:h-11 sm:text-base" />
                          </label>
                        </div>
                        <button type="submit" className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black transition hover:bg-emerald-300 sm:w-auto">
                          {fixture.result ? "Update score" : "Save score"}
                        </button>
                      </form>
                    )}

                    <details className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
                        <span>2. Cash collection</span>
                        <span className="text-xs font-normal text-white/45">{locked ? "Locked" : "Open if cash paid"}</span>
                      </summary>
                      <div className="border-t border-white/10 p-4">
                        {locked ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                              <div className="font-semibold text-white">{fixture.homeTeam.name}</div>
                              <div className="mt-2 text-emerald-200">Recorded cash: {formatMoney(homeCollected)}</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                              <div className="font-semibold text-white">{fixture.awayTeam.name}</div>
                              <div className="mt-2 text-emerald-200">Recorded cash: {formatMoney(awayCollected)}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            <CashForm refereeNightId={night.id} fixtureId={fixture.id} teamId={fixture.homeTeam.id} teamName={fixture.homeTeam.name} />
                            <CashForm refereeNightId={night.id} fixtureId={fixture.id} teamId={fixture.awayTeam.id} teamName={fixture.awayTeam.name} />
                          </div>
                        )}
                      </div>
                    </details>

                    <details open={fixtureDisciplinaryNotes.length > 0 || undefined} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
                        <span>3. Notes / discipline</span>
                        <span className="text-xs font-normal text-white/45">{fixtureDisciplinaryNotes.length} recorded{locked ? " · locked" : ""}</span>
                      </summary>
                      <div className="grid gap-4 border-t border-white/10 p-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                        {locked ? (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                            Notes are locked because the night has been submitted.
                          </div>
                        ) : (
                          <DisciplinaryNoteForm
                            refereeNightId={night.id}
                            fixtureId={fixture.id}
                            teams={[
                              { id: fixture.homeTeam.id, name: fixture.homeTeam.name },
                              { id: fixture.awayTeam.id, name: fixture.awayTeam.name },
                            ]}
                          />
                        )}

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">Recorded notes</h3>
                          {fixtureDisciplinaryNotes.length === 0 ? (
                            <p className="mt-3 text-sm text-white/50">No notes recorded for {fixtureLabel}.</p>
                          ) : (
                            <div className="mt-3 space-y-3">
                              {fixtureDisciplinaryNotes.map((note) => (
                                <div key={note.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-white">{note.teamName}</span>
                                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${severityClasses(note.severity)}`}>
                                      {formatDisciplinarySeverity(note.severity)}
                                    </span>
                                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">
                                      {formatDisciplinaryIncident(note.incidentType)}
                                    </span>
                                  </div>
                                  <p className="mt-2 whitespace-pre-line leading-6 text-white/70">{note.description}</p>
                                  <p className="mt-2 text-xs text-white/35">
                                    Recorded by {note.reportedByName || note.reportedByEmail || "referee"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </details>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <section id="submit-cashup" className={`scroll-mt-24 overflow-hidden rounded-3xl border ${locked ? "border-amber-400/20 bg-amber-400/10" : "border-emerald-400/20 bg-emerald-500/10"}`}>
          <div className={`border-b px-5 py-5 sm:px-6 ${locked ? "border-amber-400/15" : "border-emerald-400/15"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${locked ? "text-amber-100/70" : "text-emerald-300/80"}`}>End of night</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{locked ? "Cashup submitted" : "Submit cashup"}</h2>
            <p className={`mt-2 text-sm leading-6 ${locked ? "text-amber-50/70" : "text-emerald-50/70"}`}>
              {locked ? "This night has been submitted and locked. Admin will approve and settle the balance." : "Submit once scores and money collected are recorded. Admin will approve and settle the balance."}
            </p>
          </div>

          {locked ? (
            <div className="space-y-4 px-5 py-5 text-sm text-amber-50/75 sm:px-6 sm:py-6">
              <div className="rounded-2xl border border-amber-400/20 bg-black/20 px-4 py-3">
                Status: <span className="font-semibold text-white">{formatStatus(night.status)}</span>
              </div>
              {night.refereeNotes ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Submitted note</div>
                  <p className="mt-2 whitespace-pre-line text-white/70">{night.refereeNotes}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <form action={submitRefereeNightCashupAction} data-referee-cashup-submit="1" className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
              <input type="hidden" name="refereeNightId" value={night.id} />
              <textarea name="refereeNotes" rows={4} defaultValue={night.refereeNotes ?? ""} placeholder="Any notes about cash, teams, incidents or fixture issues" className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none placeholder:text-white/35 sm:text-sm" />
              {!allFixturesHaveResults ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  Some fixtures do not have scores yet. You can still submit if needed, but it is better to complete the scores first.
                </div>
              ) : null}
              <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300 sm:w-auto">
                Submit night cashup
              </button>
            </form>
          )}
        </section>
      </div>

      {!locked ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/85 p-3 backdrop-blur sm:hidden">
          <a href="#submit-cashup" className="flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-4 text-sm font-semibold text-black shadow-[0_10px_30px_rgba(16,185,129,0.25)]">
            Finish night / submit cashup
          </a>
        </div>
      ) : null}
    </div>
  );
}
