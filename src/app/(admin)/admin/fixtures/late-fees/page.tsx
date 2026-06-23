// ========================================
// File: src/app/(admin)/admin/fixtures/late-fees/page.tsx
// ========================================

import Link from "next/link";

import AdminCard from "@/components/admin/AdminCard";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getLateConfirmationFeeRows,
  setLateConfirmationFeeDecisionAction,
  type LateConfirmationFeeRow,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Late Confirmation Review | SIXFL Admin",
};

type SearchParams = {
  notice?: string;
  teamName?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatDate(value: Date | null) {
  if (!value) return "—";

  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDeadline(kickoffAt: Date) {
  return new Date(kickoffAt.getTime() - 72 * 60 * 60 * 1000);
}

function getFixtureLabel(row: LateConfirmationFeeRow) {
  return `${row.homeTeamName} vs ${row.awayTeamName}`;
}

function getNotice(input: SearchParams) {
  const teamName = input.teamName?.trim() || "that team";

  if (input.notice === "late_fee_saved") {
    return {
      tone: "success" as const,
      message: `Decision saved for ${teamName}.`,
    };
  }

  if (input.notice === "late_fee_error") {
    return {
      tone: "error" as const,
      message: `The decision could not be saved for ${teamName}.`,
    };
  }

  return null;
}

function getDecisionLabel(status: string | null) {
  switch (status) {
    case "APPLIED":
      return "Applied";
    case "WAIVED":
      return "Waived";
    case "WARNING":
      return "Warning";
    default:
      return "No decision";
  }
}

function getConfirmationLabel(status: string | null, confirmedAt: Date | null, deadline: Date) {
  if (status === "CONFIRMED" && confirmedAt && confirmedAt > deadline) {
    return "Confirmed late";
  }

  if (status === "CONFIRMED") return "Confirmed";
  if (status === "ISSUE_RAISED") return "Issue raised";
  if (status === "PENDING") return "Awaiting confirmation";
  return "No confirmation";
}

function DecisionForm({
  fixtureId,
  teamId,
  note,
}: {
  fixtureId: string;
  teamId: string;
  note: string | null;
}) {
  return (
    <form action={setLateConfirmationFeeDecisionAction} className="space-y-3">
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <input type="hidden" name="teamId" value={teamId} />
      <textarea
        name="note"
        rows={2}
        defaultValue={note ?? ""}
        placeholder="Admin note"
        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
      />
      <div className="grid gap-2 sm:grid-cols-4">
        <button name="decision" value="WARNING" className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
          Warning
        </button>
        <button name="decision" value="APPLIED" className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">
          Apply charge
        </button>
        <button name="decision" value="WAIVED" className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100">
          Waive
        </button>
        <button name="decision" value="NONE" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white/75">
          Clear
        </button>
      </div>
    </form>
  );
}

function TeamRow({
  fixtureId,
  kickoffAt,
  teamId,
  teamName,
  confirmationStatus,
  confirmedAt,
  lastChasedAt,
  decisionStatus,
  decisionNote,
}: {
  fixtureId: string;
  kickoffAt: Date;
  teamId: string;
  teamName: string;
  confirmationStatus: string | null;
  confirmedAt: Date | null;
  lastChasedAt: Date | null;
  decisionStatus: string | null;
  decisionNote: string | null;
}) {
  const deadline = getDeadline(kickoffAt);
  const confirmedOnTime = confirmationStatus === "CONFIRMED" && confirmedAt && confirmedAt <= deadline;
  const issueRaised = confirmationStatus === "ISSUE_RAISED";
  const needsDecision = new Date() > deadline && !confirmedOnTime && !issueRaised;

  return (
    <div className={cx("rounded-3xl border p-5", needsDecision ? "border-red-400/25 bg-red-500/[0.06]" : "border-white/10 bg-black/20")}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{teamName}</h3>
            {needsDecision ? <span className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100">72h missed</span> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">
              {getConfirmationLabel(confirmationStatus, confirmedAt, deadline)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">
              {getDecisionLabel(decisionStatus)}
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-white/55 sm:grid-cols-2">
            <div>Deadline: {formatDate(deadline)}</div>
            <div>Confirmed: {formatDate(confirmedAt)}</div>
            <div>Last chased: {formatDate(lastChasedAt)}</div>
            <div>Charge: £10</div>
          </div>
          {decisionNote ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65">{decisionNote}</div> : null}
        </div>
        <DecisionForm fixtureId={fixtureId} teamId={teamId} note={decisionNote} />
      </div>
    </div>
  );
}

export default async function LateConfirmationFeesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireAdmin();

  const [rows, resolvedSearchParams] = await Promise.all([
    getLateConfirmationFeeRows(),
    searchParams ? searchParams : Promise.resolve({}),
  ]);
  const notice = getNotice(resolvedSearchParams);

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-emerald-400/15 bg-white/[0.03] p-6 md:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Fixture confirmation policy</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Late confirmation review</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">Review teams that have not confirmed at least 72 hours before kick-off. Record a warning, apply the admin charge, or waive it with a note.</p>
        <Link href="/admin/fixtures" className="mt-5 inline-flex rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/5">Back to fixtures</Link>
      </section>

      {notice ? <section className={cx("rounded-2xl border px-4 py-3 text-sm", notice.tone === "success" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-red-400/20 bg-red-500/10 text-red-100")}>{notice.message}</section> : null}

      <AdminCard className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
        {rows.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/55">No scheduled fixtures are inside the review window.</div> : null}
        {rows.map((row) => (
          <section key={row.fixtureId} id={`fixture-${row.fixtureId}`} className="scroll-mt-6 space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4 md:p-5">
            <div className="border-b border-white/10 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">{row.leagueName ?? "No league"}{row.leagueSeason ? ` · ${row.leagueSeason}` : ""}</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{getFixtureLabel(row)}</h2>
              <p className="mt-1 text-sm text-white/55">{formatDate(row.kickoffAt)} · {row.venueName ?? "Venue TBC"}</p>
            </div>
            <div className="grid gap-4">
              <TeamRow fixtureId={row.fixtureId} kickoffAt={row.kickoffAt} teamId={row.homeTeamId} teamName={row.homeTeamName} confirmationStatus={row.homeConfirmationStatus} confirmedAt={row.homeConfirmedAt} lastChasedAt={row.homeLastChasedAt} decisionStatus={row.homeLateFeeStatus} decisionNote={row.homeLateFeeNote} />
              <TeamRow fixtureId={row.fixtureId} kickoffAt={row.kickoffAt} teamId={row.awayTeamId} teamName={row.awayTeamName} confirmationStatus={row.awayConfirmationStatus} confirmedAt={row.awayConfirmedAt} lastChasedAt={row.awayLastChasedAt} decisionStatus={row.awayLateFeeStatus} decisionNote={row.awayLateFeeNote} />
            </div>
          </section>
        ))}
      </AdminCard>
    </div>
  );
}
