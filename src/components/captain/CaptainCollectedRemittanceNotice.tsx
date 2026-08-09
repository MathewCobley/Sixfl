"use client";

import { useSearchParams } from "next/navigation";

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

export default function CaptainCollectedRemittanceNotice() {
  const searchParams = useSearchParams();
  const state = searchParams.get("remit");
  if (!state) return null;

  const amountPence = Number(searchParams.get("amount") ?? "0");
  const maxPence = Number(searchParams.get("max") ?? "0");

  let message = "";
  let success = false;

  switch (state) {
    case "success":
      success = true;
      message = `Stripe accepted the ${amountPence > 0 ? formatMoney(amountPence) : "captain remittance"} payment. The fixture balance will update as soon as Stripe confirmation is processed.`;
      break;
    case "cancelled":
      message = "The captain-collected payment was cancelled. Nothing has been applied to the fixture.";
      break;
    case "too_much":
      message = maxPence > 0
        ? `That amount is more than can safely be passed to this fixture right now. The current maximum is ${formatMoney(maxPence)}.`
        : "There is no captain-collected money currently available to pass to this fixture.";
      break;
    case "invalid_amount":
      message = "Enter a valid amount of captain-collected money to pass to SIXFL.";
      break;
    case "not_available":
      message = "That fixture no longer has an outstanding captain-collected amount to pay.";
      break;
    case "stripe_error":
      message = "Stripe could not start that payment. Please try again.";
      break;
    default:
      return null;
  }

  return (
    <div
      className={`rounded-2xl border px-5 py-4 text-sm ${
        success
          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
          : "border-amber-400/25 bg-amber-500/10 text-amber-100"
      }`}
    >
      {message}
    </div>
  );
}
