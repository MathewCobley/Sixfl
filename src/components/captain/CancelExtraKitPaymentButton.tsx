"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

export default function CancelExtraKitPaymentButton({
  teamId,
  chargeId,
  payerName,
  amountPence,
}: {
  teamId: string;
  chargeId: string;
  payerName: string;
  amountPence: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelRequest() {
    const confirmed = window.confirm(
      `Cancel the unpaid ${formatMoney(amountPence)} kit payment request for ${payerName}?`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/extra-kit-payments/${encodeURIComponent(chargeId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The payment request could not be cancelled.");
      }

      router.refresh();
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The payment request could not be cancelled.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void cancelRequest()}
        className="text-xs font-semibold text-red-200 underline decoration-red-400/40 underline-offset-4 disabled:opacity-50"
      >
        {busy ? "Cancelling…" : "Cancel incorrect request"}
      </button>
      {error ? <p className="mt-2 text-xs leading-5 text-red-200">{error}</p> : null}
    </div>
  );
}
