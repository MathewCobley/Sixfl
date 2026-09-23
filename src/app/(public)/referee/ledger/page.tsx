import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import RefereeAppShell from "@/components/referee/RefereeAppShell";
import { requireReferee } from "@/lib/admin";
import {
  formatDateTimeInLondon,
  toLondonDateInputValue,
} from "@/lib/datetime/london";
import {
  formatMoney,
  formatNightDate,
  getRefereeNightSummaries,
  getRefereePayableDueToRefereePence,
  isRefereeNightPayable,
  type RefereeNightSummary,
} from "@/lib/referee-nights";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PaymentEntry = {
  id: string;
  amountPence: number;
  label: string;
  detail: string;
  date: Date | null;
  dateKey: string;
};

function paymentMethodLabel(note: string | null) {
  const value = note?.toLowerCase() ?? "";
  if (value.includes("bank transfer")) return "Bank payment";
  if (value.includes("cash")) return "Cash payment";
  return "Payment from SIXFL";
}

function paymentDateKey(night: RefereeNightSummary) {
  if (night.cashDistributedAt) {
    return toLondonDateInputValue(night.cashDistributedAt);
  }
  return night.nightDate;
}

function paymentDateLabel(entry: PaymentEntry) {
  if (entry.date) {
    return formatDateTimeInLondon(entry.date, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return formatNightDate(entry.dateKey);
}

function buildPaymentEntries(nights: RefereeNightSummary[]) {
  const entries: PaymentEntry[] = [];

  for (const night of nights) {
    if (night.retainedByRefereePence > 0) {
      entries.push({
        id: `${night.id}-retained`,
        amountPence: night.retainedByRefereePence,
        label: "Cash kept on the night",
        detail: night.leagueName,
        date: null,
        dateKey: night.nightDate,
      });
    }

    if (night.cashPaidToRefereePence > 0) {
      entries.push({
        id: `${night.id}-paid`,
        amountPence: night.cashPaidToRefereePence,
        label: paymentMethodLabel(night.cashDistributionNotes),
        detail: night.leagueName,
        date: night.cashDistributedAt,
        dateKey: paymentDateKey(night),
      });
    }
  }

  return entries.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export default async function RefereeLedgerPage() {
  const { user, authenticatedUser, isAdminPreview } = await requireReferee();

  if (authenticatedUser.role === UserRole.ADMIN && !isAdminPreview) {
    redirect("/admin/referees?error=select_referee_preview");
  }

  const todayLondonDate = toLondonDateInputValue(new Date());
  const nights = await getRefereeNightSummaries({ refereeId: user.id });
  const earnedNights = nights.filter((night) =>
    isRefereeNightPayable(night, todayLondonDate),
  );

  const totalEarnedPence = earnedNights.reduce(
    (sum, night) => sum + night.feePence,
    0,
  );
  const totalReceivedPence = earnedNights.reduce(
    (sum, night) =>
      sum + night.retainedByRefereePence + night.cashPaidToRefereePence,
    0,
  );
  const totalOwedPence = earnedNights.reduce(
    (sum, night) =>
      sum + getRefereePayableDueToRefereePence(night, todayLondonDate),
    0,
  );
  const payments = buildPaymentEntries(earnedNights);

  return (
    <RefereeAppShell active="ledger" title="Ledger">
      <section className="rounded-[1.35rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-3.5">
        <h1 className="text-lg font-black text-white">Your money</h1>
        <p className="mt-1 text-xs leading-5 text-white/45">
          Completed nights only. Future nights are not counted until they become payable.
        </p>

        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-xl border border-white/[0.08] bg-black/20 px-2 py-2.5">
            <div className="text-[9px] text-white/40">Earned</div>
            <div className="mt-1 text-base font-black tabular-nums text-white">
              {formatMoney(totalEarnedPence)}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.07] px-2 py-2.5">
            <div className="text-[9px] text-emerald-100/55">Received</div>
            <div className="mt-1 text-base font-black tabular-nums text-emerald-100">
              {formatMoney(totalReceivedPence)}
            </div>
          </div>
          <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.07] px-2 py-2.5">
            <div className="text-[9px] text-amber-100/55">Still owed</div>
            <div className="mt-1 text-base font-black tabular-nums text-amber-100">
              {formatMoney(totalOwedPence)}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-base font-black text-white">
              Money received
            </h2>
          </div>
          <span className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold text-white/50">
            {payments.length} entr{payments.length === 1 ? "y" : "ies"}
          </span>
        </div>

        {payments.length === 0 ? (
          <div className="mt-2 rounded-[1.2rem] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/50">
            No referee payments have been recorded yet.
          </div>
        ) : (
          <div className="mt-2 overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.025]">
            {payments.map((entry, index) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between gap-3 px-3.5 py-3.5 ${
                  index > 0 ? "border-t border-white/[0.07]" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{entry.label}</div>
                  <div className="mt-0.5 truncate text-xs text-white/40">
                    {paymentDateLabel(entry)} · {entry.detail}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-black tabular-nums text-emerald-200">
                  +{formatMoney(entry.amountPence)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </RefereeAppShell>
  );
}
