"use client";

import Link from "next/link";
import {
  ArrowDownTrayIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  CreditCardIcon,
  EyeIcon,
  LinkIcon,
  ReceiptPercentIcon,
} from "@heroicons/react/24/outline";

export type PlayerAppPaymentFee = {
  id: string;
  fixtureLabel: string;
  dateLabel: string;
  balancePence: number;
  paymentPath: string | null;
  collectionPaused: boolean;
  inArrangement: boolean;
};

export type PlayerAppPaymentActivity = {
  id: string;
  dateLabel: string;
  title: string;
  detail: string;
  fixtureLabel: string | null;
  amountPence: number;
  balancePence: number;
  receivedByCaptain: boolean;
};

export type PlayerAppPaymentLinkHistory = {
  settlementLabel?: string | null;
  id: string;
  fixtureLabel: string | null;
  amountPence: number | null;
  createdLabel: string;
  historicalBackfill: boolean;
  createdByLabel: string | null;
  createdVia: string | null;
  endedByLabel: string | null;
  endedVia: string | null;
  endedReason: string | null;
  endedEventType: string | null;
  firstOpenedLabel: string | null;
  lastOpenedLabel: string | null;
  openCount: number;
  isRemoved: boolean;
  removedLabel: string | null;
  removedReason: string | null;
  paymentUrl: string;
  activePath: string | null;
};

export type PlayerAppPaymentPlan = {
  id: string;
  status: string;
  balancePence: number;
  nextInstalmentPence: number;
  nextDueLabel: string;
  paymentPath: string;
};

function money(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function amountTone(amountPence: number) {
  if (amountPence < 0) return "text-emerald-200";
  if (amountPence > 0) return "text-amber-100";
  return "text-white/55";
}

function planStatusLabel(status: string) {
  if (status === "ACTIVE") return "Active";
  if (status === "PAUSED") return "Paused";
  if (status === "REVIEW") return "Needs review";
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function PlayerAppPayments({
  teamName,
  playerName,
  balancePence,
  paidPence,
  outstandingFees,
  recentActivity,
  paymentLinks,
  activePlan,
}: {
  teamName: string;
  playerName: string | null;
  balancePence: number;
  paidPence: number;
  outstandingFees: PlayerAppPaymentFee[];
  recentActivity: PlayerAppPaymentActivity[];
  paymentLinks: PlayerAppPaymentLinkHistory[];
  activePlan: PlayerAppPaymentPlan | null;
}) {
  const nextFee = outstandingFees.find(
    (fee) => fee.paymentPath && !fee.collectionPaused && !fee.inArrangement,
  );
  const primaryPaymentPath = activePlan?.paymentPath ?? nextFee?.paymentPath ?? null;
  const primaryAmount = activePlan?.nextInstalmentPence ?? nextFee?.balancePence ?? 0;
  const allClear = balancePence <= 0;

  return (
    <main className="min-h-screen bg-[#07130f] px-3 pb-28 pt-2 text-white">
      <div className="mx-auto w-full max-w-xl space-y-3">
        <header className="px-1 pb-1 pt-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">
            {teamName}
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black tracking-tight">Payments</h1>
              <p className="mt-1 text-xs text-white/40">
                {playerName ? `${playerName} · ` : ""}match fees and payment history
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10">
              <BanknotesIcon className="h-5 w-5 text-emerald-200" />
            </div>
          </div>
        </header>

        <section
          className={[
            "overflow-hidden rounded-[1.6rem] border p-4 shadow-[0_18px_52px_rgba(0,0,0,0.28)]",
            allClear
              ? "border-emerald-400/25 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.16),transparent_42%),linear-gradient(145deg,#0b1c14,#08120e)]"
              : "border-amber-300/25 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_42%),linear-gradient(145deg,#20180b,#0b1510)]",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                Current balance
              </p>
              <div className="mt-1 text-4xl font-black tracking-tight text-white">
                {money(Math.max(balancePence, 0))}
              </div>
              <p className="mt-1 text-xs leading-5 text-white/50">
                {allClear
                  ? "You have nothing outstanding."
                  : `${outstandingFees.length} unpaid match fee${outstandingFees.length === 1 ? "" : "s"} on this account.`}
              </p>
            </div>
            {allClear ? (
              <CheckCircleIcon className="h-8 w-8 shrink-0 text-emerald-300" />
            ) : (
              <ReceiptPercentIcon className="h-8 w-8 shrink-0 text-amber-200" />
            )}
          </div>

          {primaryPaymentPath && primaryAmount > 0 ? (
            <Link
              href={primaryPaymentPath}
              className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 text-sm font-black text-black transition active:scale-[0.99]"
            >
              <CreditCardIcon className="h-5 w-5" />
              {activePlan
                ? `Pay next instalment · ${money(primaryAmount)}`
                : `Pay now · ${money(primaryAmount)}`}
            </Link>
          ) : null}

          <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/20">
            <div className="px-2 py-2.5 text-center">
              <div className="text-sm font-black text-white">{money(Math.max(balancePence, 0))}</div>
              <div className="mt-0.5 text-[9px] text-white/35">Outstanding</div>
            </div>
            <div className="px-2 py-2.5 text-center">
              <div className="text-sm font-black text-emerald-100">{money(paidPence)}</div>
              <div className="mt-0.5 text-[9px] text-white/35">Paid</div>
            </div>
            <div className="px-2 py-2.5 text-center">
              <div className="text-sm font-black text-white">{outstandingFees.length}</div>
              <div className="mt-0.5 text-[9px] text-white/35">Open fees</div>
            </div>
          </div>
        </section>

        {activePlan ? (
          <section className="rounded-[1.45rem] border border-sky-400/20 bg-sky-500/[0.07] p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-400/10">
                <ClockIcon className="h-5 w-5 text-sky-200" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-black text-white">Agreed smaller payments</h2>
                  <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-sky-100">
                    {planStatusLabel(activePlan.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-white/50">
                  {money(activePlan.balancePence)} remains in the arrangement.
                </p>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2.5">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.14em] text-white/35">Next payment</div>
                    <div className="mt-0.5 text-sm font-black text-white">
                      {money(activePlan.nextInstalmentPence)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[0.14em] text-white/35">Due</div>
                    <div className="mt-0.5 text-xs font-bold text-white/70">{activePlan.nextDueLabel}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[1.55rem] border border-white/[0.07] bg-white/[0.035]">
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200/70">
                What you owe
              </p>
              <h2 className="mt-1 text-lg font-black">Match fees</h2>
            </div>
            <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-bold text-white/45">
              {outstandingFees.length} open
            </span>
          </div>

          {outstandingFees.length === 0 ? (
            <div className="border-t border-white/[0.06] px-4 py-5 text-sm leading-6 text-white/45">
              No unpaid match fees. New fees will appear here when they are due.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {outstandingFees.map((fee) => (
                <article key={fee.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10">
                      <ReceiptPercentIcon className="h-4.5 w-4.5 text-amber-200" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-white">{fee.fixtureLabel}</h3>
                          <p className="mt-0.5 text-[11px] text-white/40">{fee.dateLabel}</p>
                        </div>
                        <div className="shrink-0 text-sm font-black text-white">{money(fee.balancePence)}</div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {fee.inArrangement ? (
                          <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-0.5 text-[9px] font-bold text-sky-100">
                            In payment plan
                          </span>
                        ) : null}
                        {fee.collectionPaused ? (
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold text-white/50">
                            Collection paused
                          </span>
                        ) : null}
                      </div>

                      {fee.paymentPath && !fee.inArrangement && !fee.collectionPaused ? (
                        <Link
                          href={fee.paymentPath}
                          className="mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 text-xs font-black text-amber-100"
                        >
                          Pay this fee
                          <ChevronRightIcon className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-[1.55rem] border border-white/[0.07] bg-white/[0.035]">
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-sky-200/70">
                Audit trail
              </p>
              <h2 className="mt-1 text-lg font-black">Payment link history</h2>
              <p className="mt-1 text-[11px] leading-5 text-white/35">
                Every recorded player payment link stays here, even after it is removed.
              </p>
            </div>
            <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-bold text-white/45">
              {paymentLinks.length}
            </span>
          </div>

          {paymentLinks.length === 0 ? (
            <div className="border-t border-white/[0.06] px-4 py-5 text-sm text-white/45">
              No player payment links have been recorded for this account.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {paymentLinks.map((link) => (
                <article key={link.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-400/10">
                      <LinkIcon className="h-4.5 w-4.5 text-sky-200" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-white">
                            {link.fixtureLabel || "Player payment link"}
                          </h3>
                          <p className="mt-0.5 text-[10px] text-white/35">
                            {link.historicalBackfill ? "First recorded" : "Created"} {link.createdLabel}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {link.amountPence !== null ? (
                            <div className="text-sm font-black text-white">
                              {money(link.amountPence)}
                            </div>
                          ) : null}
                          <span
                            className={[
                              "mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em]",
                              link.settlementLabel ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : link.isRemoved
                                ? "border border-red-400/20 bg-red-500/10 text-red-100"
                                : link.activePath
                                  ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                                  : "border border-white/10 bg-white/[0.04] text-white/55",
                            ].join(" ")}
                          >
                            {link.settlementLabel ?? (link.isRemoved ? "Removed" : link.activePath ? "Active" : "Closed")}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 grid gap-1.5 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2 text-[10px] leading-4 text-white/45">
                        <div>
                          <span className="font-bold text-white/65">Created by:</span>{" "}
                          {link.createdByLabel || "Actor not recorded"}
                          {link.createdVia ? ` · ${link.createdVia}` : ""}
                        </div>
                        {link.endedByLabel ? (
                          <div>
                            <span className="font-bold text-white/65">
                              {link.endedEventType === "REMOVED"
                                ? "Removed by:"
                                : link.endedEventType === "REOPENED"
                                  ? "Reopened by:"
                                  : "Closed by:"}
                            </span>{" "}
                            {link.endedByLabel}
                            {link.endedVia ? ` · ${link.endedVia}` : ""}
                            {link.endedReason ? ` · ${link.endedReason}` : ""}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-2 break-all rounded-lg bg-black/15 px-2 py-1.5 font-mono text-[9px] leading-4 text-white/25">
                        {link.paymentUrl}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/40">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-1">
                          <EyeIcon className="h-3.5 w-3.5" />
                          {link.openCount > 0
                            ? `Opened ${link.openCount} time${link.openCount === 1 ? "" : "s"}`
                            : "Never opened"}
                        </span>
                        {link.firstOpenedLabel ? (
                          <span>First {link.firstOpenedLabel}</span>
                        ) : null}
                        {link.lastOpenedLabel && link.openCount > 1 ? (
                          <span>Last {link.lastOpenedLabel}</span>
                        ) : null}
                      </div>

                      {link.settlementLabel ? <p className="mt-3 text-xs text-emerald-100/70">This match fee is settled. No payment is due.</p> : link.isRemoved ? (
                        <div className="mt-2 rounded-xl border border-red-400/10 bg-red-500/[0.05] px-3 py-2 text-[10px] leading-5 text-red-100/70">
                          {link.removedLabel ? `Removed ${link.removedLabel}. ` : "Removed. "}
                          {link.removedReason || "This payment link is no longer active."}
                        </div>
                      ) : link.activePath ? (
                        <Link
                          href={link.activePath}
                          className="mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-sky-300/25 bg-sky-400/10 px-3 text-xs font-black text-sky-100"
                        >
                          Open active link
                          <ChevronRightIcon className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-[1.55rem] border border-white/[0.07] bg-white/[0.035]">
          <div className="px-4 pb-3 pt-4">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200/70">
              Recent
            </p>
            <h2 className="mt-1 text-lg font-black">Payment activity</h2>
            <p className="mt-1 text-[11px] leading-5 text-white/35">Most recent activity first.</p>
          </div>

          {recentActivity.length === 0 ? (
            <div className="border-t border-white/[0.06] px-4 py-5 text-sm text-white/45">
              No payment activity has been recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {recentActivity.map((entry) => (
                <div key={entry.id} className="flex gap-3 px-4 py-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.045]">
                    {entry.amountPence < 0 ? (
                      <ArrowDownTrayIcon className="h-4.5 w-4.5 text-emerald-200" />
                    ) : (
                      <ReceiptPercentIcon className="h-4.5 w-4.5 text-white/55" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white">{entry.title}</div>
                        {entry.fixtureLabel ? (
                          <div className="mt-0.5 truncate text-[11px] font-semibold text-emerald-100/70">
                            {entry.fixtureLabel}
                          </div>
                        ) : null}
                        <div className="mt-0.5 text-[10px] text-white/35">{entry.dateLabel}</div>
                      </div>
                      <div className={`shrink-0 text-sm font-black ${amountTone(entry.amountPence)}`}>
                        {entry.amountPence > 0 ? "+" : ""}
                        {money(entry.amountPence)}
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/40">{entry.detail}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/30">
                      <span>Balance {money(entry.balancePence)}</span>
                      {entry.receivedByCaptain ? <span>Paid captain directly</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="px-2 pb-2 text-center text-[10px] leading-5 text-white/30">
          Payments shown here are your SIXFL player account for this team. If something looks wrong, contact your captain or SIXFL before paying.
        </p>
      </div>
    </main>
  );
}
