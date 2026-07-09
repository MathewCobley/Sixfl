// ========================================
// File: src/app/(admin)/admin/fixtures/late-fees/page.tsx
// ========================================

import Link from "next/link";

import AdminCard from "@/components/admin/AdminCard";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getLateConfirmationFeeRows,
  getPaymentLateFeeRows,
  setLateConfirmationFeeDecisionAction,
  setLatePaymentAdminFeeDecisionAction,
  type LateConfirmationFeeRow,
  type PaymentLateFeeRow,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Late Fees | SIXFL Admin",
};

type SearchParams = {
  notice?: string;
  teamName?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
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

function getPaymentFixtureLabel(row: PaymentLateFeeRow) {
  if (row.homeTeamName && row.awayTeamName && row.kickoffAt) {
    return `${row.homeTeamName} vs ${row.awayTeamName} · ${formatDate(row.kickoffAt)}`;
  }

  return "Manual charge";
}

function getNotice(input: SearchParams) {
  const teamName = input.teamName?.trim() || "that team";

  if (input.notice === "late_fee_saved") {
    return {
      tone: "success" as const,
      message: `Confirmation fee decision saved for ${teamName}.`,
    };
  }

  if (input.notice === "payment_late_fee_saved") {
    return {
      tone: "success" as const,
      message: `Payment admin fee decision saved for ${teamName}.`,
    };
  }

  if (input.notice === "late_fee_error") {
    return {
      tone: "error" as const,
      message: `The confirmation fee decision could not be saved for ${teamName}.`,
    };
  }

  if (input.notice === "payment_late_fee_error") {
    return {
      tone: "error" as const,
      message: `The payment admin fee decision could not be saved for ${teamName}.`,
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
    case "NONE":
      return "No decision";
    default:
      return "No decision";
  }
}

function getDecisionTone(status: string | null) {
  switch (status) {
    case "APPLIED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    case "WAIVED":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "WARNING":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    default:
      return "border-white/10 bg-white/5 text-white/70";
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

function getPaymentLateFeeAuditItems(row: PaymentLateFeeRow) {
  return [
    row.paymentLateFeeWarningAt
      ? {
          label: "Warning sent",
          value: formatDate(row.paymentLateFeeWarningAt),
          tone: "border-amber-400/20 bg-amber-500/10 text-amber-100",
        }
      : null,
    row.paymentLateFeeAppliedAt
      ? {
          label: "£10 added",
          value: formatDate(row.paymentLateFeeAppliedAt),
          tone: "border-red-400/20 bg-red-500/10 text-red-100",
        }
      : null,
    row.paymentLateFeeWaivedAt
      ? {
          label: "Waived",
          value: formatDate(row.paymentLateFeeWaivedAt),
          tone: "border-sky-400/20 bg-sky-500/10 text-sky-100",
        }
      : null,
  ].filter((item): item is { label: string; value: string; tone: string } => item !== null);
}

function PaymentLateFeeDecisionForm({
  chargeId,
  note,
}: {
  chargeId: string;
  note: string | null;
}) {
  return (
    <form action={setLatePaymentAdminFeeDecisionAction} className="space-y-3">
      <input type="hidden" name="chargeId" value={chargeId} />
      <textarea
        name="note"
        rows={2}
        defaultValue={note ?? ""}
        placeholder="Admin note shown only internally"
        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
      />
      <div className="grid gap-2 sm:grid-cols-4">
        <button name="decision" value="WARNING" className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
          Warning
        </button>
        <button name="decision" value="APPLIED" className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">
          Add £10
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

function ConfirmationDecisionForm({
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

function HistoryPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/65">
      {label}: {value}
    </span>
  );
}

function PaymentLateFeeRowCard({ row }: { row: PaymentLateFeeRow }) {
  const feeAmount = row.paymentLateFeeAmountPence || 1000;
  const baseChargeAmount =
    row.paymentLateFeeStatus === "APPLIED"
      ? Math.max(0, row.amountPence - feeAmount)
      : row.amountPence;
  const auditItems = getPaymentLateFeeAuditItems(row);

  return (
    <div id={`payment-charge-${row.chargeId}`} className={cx("scroll-mt-6 rounded-3xl border p-5", row.paymentLateFeeStatus === "APPLIED" ? "border-red-400/25 bg-red-500/[0.06]" : "border-amber-400/25 bg-amber-500/[0.05]")}> 
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/teams/${row.teamId}`} className="text-lg font-semibold text-white underline-offset-4 hover:text-emerald-200 hover:underline">
              {row.teamName}
            </Link>
            <span className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100">
              {row.daysLate ?? 0} days late
            </span>
            <span className={cx("rounded-full border px-3 py-1 text-xs font-semibold", getDecisionTone(row.paymentLateFeeStatus))}>
              {getDecisionLabel(row.paymentLateFeeStatus)}
            </span>
            {row.paymentLateFeeStatus === "WARNING" && row.paymentLateFeeWarningAt ? (
              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                Warning sent {formatDate(row.paymentLateFeeWarningAt)}
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-base font-semibold text-white">{row.title}</h3>
          <p className="mt-1 text-sm text-white/55">{row.description || getPaymentFixtureLabel(row)}</p>

          <div className="mt-4 grid gap-2 text-sm text-white/55 sm:grid-cols-2 xl:grid-cols-3">
            <div>Due: {formatDate(row.dueDate)}</div>
            <div>Late fee eligible: {formatDate(row.lateFeeEligibleAt)}</div>
            <div>Admin fee: {formatMoney(feeAmount)}</div>
            <div>Base charge: {formatMoney(baseChargeAmount)}</div>
            <div>Paid: {formatMoney(row.paidTotalPence)}</div>
            <div>Outstanding: {formatMoney(row.outstandingPence)}</div>
          </div>

          {auditItems.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Admin fee audit trail
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {auditItems.map((item) => (
                  <span key={item.label} className={cx("rounded-full border px-3 py-1 text-xs font-semibold", item.tone)}>
                    {item.label}: {item.value}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/admin/payments?paymentChargeId=${encodeURIComponent(row.chargeId)}#record-payment`} className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/15">
              Record payment
            </Link>
            <Link href="/admin/payments" className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/[0.08]">
              Open payments
            </Link>
          </div>

          {row.paymentLateFeeNote ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65">
              {row.paymentLateFeeNote}
            </div>
          ) : null}
        </div>

        <PaymentLateFeeDecisionForm chargeId={row.chargeId} note={row.paymentLateFeeNote} />
      </div>
    </div>
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
  historyWarnings,
  historyApplied,
  historyWaived,
  historyLateConfirms,
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
  historyWarnings: number;
  historyApplied: number;
  historyWaived: number;
  historyLateConfirms: number;
}) {
  const deadline = getDeadline(kickoffAt);
  const confirmedOnTime = confirmationStatus === "CONFIRMED" && confirmedAt && confirmedAt <= deadline;
  const issueRaised = confirmationStatus === "ISSUE_RAISED";
  const needsDecision = new Date() > deadline && !confirmedOnTime && !issueRaised;
  const hasHistory = historyWarnings + historyApplied + historyWaived + historyLateConfirms > 0;

  return (
    <div className={cx("rounded-3xl border p-5", needsDecision ? "border-red-400/25 bg-red-500/[0.06]" : "border-white/10 bg-black/20")}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/teams/${teamId}/late-fees`} className="text-lg font-semibold text-white underline-offset-4 hover:text-emerald-200 hover:underline">
              {teamName}
            </Link>
            {needsDecision ? <span className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100">72h missed</span> : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">
              {getConfirmationLabel(confirmationStatus, confirmedAt, deadline)}
            </span>
            <span className={cx("rounded-full border px-3 py-1", getDecisionTone(decisionStatus))}>
              {getDecisionLabel(decisionStatus)}
            </span>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-white/55 sm:grid-cols-2">
            <div>Deadline: {formatDate(deadline)}</div>
            <div>Confirmed: {formatDate(confirmedAt)}</div>
            <div>Last chased: {formatDate(lastChasedAt)}</div>
            <div>Charge: £10</div>
          </div>

          <div className={cx("mt-4 rounded-2xl border p-3", hasHistory ? "border-amber-400/15 bg-amber-500/[0.04]" : "border-white/10 bg-white/[0.03]")}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Team history
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <HistoryPill label="Warnings" value={historyWarnings} />
              <HistoryPill label="Applied" value={historyApplied} />
              <HistoryPill label="Waived" value={historyWaived} />
              <HistoryPill label="Late confirms" value={historyLateConfirms} />
            </div>
            <Link href={`/admin/teams/${teamId}/late-fees`} className="mt-3 inline-flex text-xs font-semibold text-emerald-300 hover:text-emerald-200">
              Open full team history →
            </Link>
          </div>

          {decisionNote ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65">{decisionNote}</div> : null}
        </div>
        <ConfirmationDecisionForm fixtureId={fixtureId} teamId={teamId} note={decisionNote} />
      </div>
    </div>
  );
}

export default async function LateFeesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireAdmin();

  const [paymentRows, confirmationRows, resolvedSearchParams] = await Promise.all([
    getPaymentLateFeeRows(),
    getLateConfirmationFeeRows(),
    searchParams ? searchParams : Promise.resolve({}),
  ]);
  const notice = getNotice(resolvedSearchParams);
  const paymentFeeOutstanding = paymentRows.reduce((sum, row) => sum + row.outstandingPence, 0);
  const appliedPaymentFees = paymentRows.filter((row) => row.paymentLateFeeStatus === "APPLIED").length;

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-emerald-400/15 bg-white/[0.03] p-6 md:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Late fee control centre</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Late fees</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
          Manage payment admin fees for charges more than 7 days overdue and fixture confirmation fees for teams that miss the 72-hour confirmation deadline. Decisions stay manual so you can warn, apply, waive or clear fairly.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/payments" className="inline-flex rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/5">Open payments</Link>
          <Link href="/admin/fixtures" className="inline-flex rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/5">Open fixtures</Link>
        </div>
      </section>

      {notice ? <section className={cx("rounded-2xl border px-4 py-3 text-sm", notice.tone === "success" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-red-400/20 bg-red-500/10 text-red-100")}>{notice.message}</section> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-100/70">Payment fee decisions</div>
          <div className="mt-3 text-3xl font-semibold text-white">{paymentRows.length}</div>
          <p className="mt-2 text-sm text-red-100/70">Charges more than 7 days overdue.</p>
        </div>
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/70">Outstanding in review</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatMoney(paymentFeeOutstanding)}</div>
          <p className="mt-2 text-sm text-amber-100/70">Current outstanding balances shown below.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">£10 fees added</div>
          <div className="mt-3 text-3xl font-semibold text-white">{appliedPaymentFees}</div>
          <p className="mt-2 text-sm text-white/50">Applied but still unpaid.</p>
        </div>
      </div>

      <AdminCard className="space-y-5 rounded-3xl border border-red-400/20 bg-red-500/[0.04] p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-100/70">Payment admin fees</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Fees paid more than 7 days late</h2>
            <p className="mt-2 max-w-3xl text-sm text-white/65">
              Use this section to manually add the £10 admin fee to the existing outstanding charge, waive it, or send a warning decision. Applying the fee increases the outstanding balance and resets any stale Stripe checkout session.
            </p>
          </div>
          <span className="rounded-2xl border border-red-400/25 bg-black/20 px-4 py-3 text-sm font-semibold text-red-100">
            {paymentRows.length} charge{paymentRows.length === 1 ? "" : "s"}
          </span>
        </div>

        {paymentRows.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/55">No payment charges are more than 7 days overdue.</div> : null}
        <div className="space-y-4">
          {paymentRows.map((row) => <PaymentLateFeeRowCard key={row.chargeId} row={row} />)}
        </div>
      </AdminCard>

      <AdminCard className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Fixture confirmation policy</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">72-hour confirmation review</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/65">
            Review teams that have not confirmed at least 72 hours before kick-off. Each row shows previous warnings, charges, waived decisions and late confirmations to help you decide fairly.
          </p>
        </div>
        {confirmationRows.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/55">No scheduled fixtures are inside the review window.</div> : null}
        {confirmationRows.map((row) => (
          <section key={`${row.fixtureId}:${row.teamId}`} id={`fixture-${row.fixtureId}`} className="scroll-mt-6 space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4 md:p-5">
            <div className="border-b border-white/10 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">{row.leagueName ?? "No league"}{row.leagueSeason ? ` · ${row.leagueSeason}` : ""}</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{getFixtureLabel(row)}</h2>
              <p className="mt-1 text-sm text-white/55">{formatDate(row.kickoffAt)} · {row.venueName ?? "Venue TBC"}</p>
            </div>
            <TeamRow
              fixtureId={row.fixtureId}
              kickoffAt={row.kickoffAt}
              teamId={row.teamId}
              teamName={row.teamName}
              confirmationStatus={row.confirmationStatus}
              confirmedAt={row.confirmedAt}
              lastChasedAt={row.lastChasedAt}
              decisionStatus={row.decisionStatus}
              decisionNote={row.decisionNote}
              historyWarnings={row.historyWarnings}
              historyApplied={row.historyApplied}
              historyWaived={row.historyWaived}
              historyLateConfirms={row.historyLateConfirms}
            />
          </section>
        ))}
      </AdminCard>
    </div>
  );
}
