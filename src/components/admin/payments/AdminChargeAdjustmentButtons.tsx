"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function parsePounds(value: string) {
  const amountPounds = Number(value.replace(/[£,\s]/g, ""));
  if (!Number.isFinite(amountPounds)) return null;
  const pence = Math.round(amountPounds * 100);
  return pence > 0 ? pence : null;
}

export default function AdminChargeAdjustmentButtons({
  chargeId,
  teamName,
  title,
  amountPence,
  outstandingPence,
}: {
  chargeId: string;
  teamName: string;
  title: string;
  amountPence: number;
  outstandingPence: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"reduce" | "waive" | null>(null);

  if (outstandingPence <= 0) return null;

  async function reduceCharge() {
    const defaultAmount = (outstandingPence / 100).toFixed(2);
    const amountText = window.prompt(
      `How much do you want to reduce the match fee by?\n\n${teamName}\n${title}\nCurrent charge: ${formatMoney(amountPence)}\nOutstanding: ${formatMoney(outstandingPence)}\n\nEnter reduction in £:`,
      defaultAmount,
    );
    if (amountText === null) return;

    const waivePence = parsePounds(amountText);
    if (!waivePence) {
      window.alert("Enter a valid amount greater than £0.00.");
      return;
    }
    if (waivePence > outstandingPence) {
      window.alert(`You can reduce this charge by up to ${formatMoney(outstandingPence)}.`);
      return;
    }

    const reason = window.prompt(
      "Reason for reducing the match fee (kept in the audit note):",
      "Goodwill adjustment",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert("Please enter a reason for the reduction.");
      return;
    }

    const newAmountPence = amountPence - waivePence;
    const remainingOutstandingPence = outstandingPence - waivePence;
    if (
      !window.confirm(
        `Confirm match-fee reduction?\n\n${teamName}\n${title}\n\nReduce charge by: ${formatMoney(waivePence)}\nNew charge total: ${formatMoney(newAmountPence)}\nRemaining outstanding: ${formatMoney(remainingOutstandingPence)}\n\nReason: ${reason.trim()}\n\nThis changes the original fixture charge.`,
      )
    ) {
      return;
    }

    setBusy("reduce");
    try {
      const response = await fetch("/api/admin/payments/adjust-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId, waivePence, reason: reason.trim() }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; newAmountPence?: number; outstandingPence?: number }
        | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not reduce match fee.");

      window.alert(
        `Match fee reduced.\n\nNew charge: ${formatMoney(data?.newAmountPence ?? newAmountPence)}\nOutstanding: ${formatMoney(data?.outstandingPence ?? remainingOutstandingPence)}`,
      );
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not reduce match fee.");
    } finally {
      setBusy(null);
    }
  }

  async function waiveOutstanding() {
    const defaultAmount = (outstandingPence / 100).toFixed(2);
    const amountText = window.prompt(
      `How much of the outstanding balance do you want SIXFL to waive?\n\n${teamName}\n${title}\nOriginal charge remains: ${formatMoney(amountPence)}\nOutstanding: ${formatMoney(outstandingPence)}\n\nEnter waiver amount in £:`,
      defaultAmount,
    );
    if (amountText === null) return;

    const waiverPence = parsePounds(amountText);
    if (!waiverPence) {
      window.alert("Enter a valid amount greater than £0.00.");
      return;
    }
    if (waiverPence > outstandingPence) {
      window.alert(`You can waive up to ${formatMoney(outstandingPence)} on this charge.`);
      return;
    }

    const reason = window.prompt(
      "Reason for the SIXFL waiver (kept in the audit note):",
      "Goodwill waiver",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert("Please enter a reason for the waiver.");
      return;
    }

    const remainingOutstandingPence = outstandingPence - waiverPence;
    if (
      !window.confirm(
        `Confirm SIXFL waiver?\n\n${teamName}\n${title}\n\nFixture charge stays: ${formatMoney(amountPence)}\nSIXFL waiver: ${formatMoney(waiverPence)}\nRemaining outstanding: ${formatMoney(remainingOutstandingPence)}\n\nReason: ${reason.trim()}\n\nThis is recorded as a waiver, not as a payment. Open player links remain collectible.`,
      )
    ) {
      return;
    }

    setBusy("waive");
    try {
      const response = await fetch("/api/admin/payments/waive-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId, waiverPence, reason: reason.trim() }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; chargeAmountPence?: number; waiverPence?: number; outstandingPence?: number }
        | null;
      if (!response.ok) throw new Error(data?.error ?? "Could not waive outstanding balance.");

      window.alert(
        `Waiver recorded.\n\nFixture charge: ${formatMoney(data?.chargeAmountPence ?? amountPence)}\nSIXFL waiver: ${formatMoney(data?.waiverPence ?? waiverPence)}\nOutstanding: ${formatMoney(data?.outstandingPence ?? remainingOutstandingPence)}`,
      );
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not waive outstanding balance.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={reduceCharge}
        disabled={busy !== null}
        className="inline-flex items-center rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy === "reduce" ? "Reducing..." : "Reduce match fee"}
      </button>
      <button
        type="button"
        onClick={waiveOutstanding}
        disabled={busy !== null}
        className="inline-flex items-center rounded-xl border border-sky-300/30 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-50 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy === "waive" ? "Waiving..." : "Waive outstanding"}
      </button>
    </>
  );
}
