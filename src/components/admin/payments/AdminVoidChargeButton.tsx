// ========================================
// File: src/components/admin/payments/AdminVoidChargeButton.tsx
// ========================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  chargeId: string;
  returnTo?: string;
};

export default function AdminVoidChargeButton({
  chargeId,
  returnTo = "/admin/payments?view=teamCharges&created=charge_voided",
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function voidCharge() {
    if (submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/payments/void-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chargeId,
          reason: "Voided by admin from the payments screen.",
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The charge could not be voided.");
      }

      router.push(returnTo);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The charge could not be voided.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        disabled={submitting}
        onClick={voidCharge}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-red-400/35 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-50 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Voiding charge…" : "Confirm void charge"}
      </button>
    </div>
  );
}
