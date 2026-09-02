// ========================================
// File: src/components/admin/player-pool/BulkPlayerPoolProfileReminderButton.tsx
// ========================================

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type BulkReminderResponse = {
  ok?: boolean;
  targeted?: number;
  queued?: number;
  skipped?: number;
  failed?: number;
  errors?: string[];
  error?: string;
};

type BulkResult = {
  targeted: number;
  queued: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export default function BulkPlayerPoolProfileReminderButton({
  awaitingCount,
}: {
  awaitingCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendBulkReminder() {
    const confirmed = window.confirm(
      `Email all ${awaitingCount} players still awaiting their PlayerPool profile?\n\nEach player will receive the full PlayerPool explanation and their own secure profile link. Eligible players who still have not completed it will then receive an automatic SMS nudge 48 hours after the email is delivered.`,
    );

    if (!confirmed) return;

    setPending(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/admin/player-pool/bulk-profile-reminders",
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => null)) as
        | BulkReminderResponse
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error || "The bulk PlayerPool email could not be sent.",
        );
      }

      setResult({
        targeted: payload.targeted ?? 0,
        queued: payload.queued ?? 0,
        skipped: payload.skipped ?? 0,
        failed: payload.failed ?? 0,
        errors: payload.errors ?? [],
      });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The bulk PlayerPool email could not be sent.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="border-b border-white/10 bg-amber-500/[0.055] px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">
            Email &amp; SMS profile reminders
          </p>
          <h3 className="mt-2 text-lg font-black text-white">
            Email everyone who is still awaiting their profile
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/60">
            This sends the full PlayerPool explanation and each player&apos;s own secure
            form link. If they still have not completed it, SIXFL automatically sends
            one SMS 48 hours after the email is delivered and a final SMS five days
            later. Completed profiles and players without a usable mobile are skipped.
          </p>
        </div>

        <button
          type="button"
          onClick={sendBulkReminder}
          disabled={pending || awaitingCount === 0}
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border border-amber-300/35 bg-amber-400/15 px-5 py-3 text-sm font-black text-amber-50 transition hover:border-amber-300/55 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {pending
            ? "Queueing profile emails…"
            : awaitingCount === 0
              ? "No profiles awaiting"
              : `Email all awaiting profiles (${awaitingCount})`}
        </button>
      </div>

      {result ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-50">
          <strong>{result.queued} profile email{result.queued === 1 ? "" : "s"} queued for delivery.</strong>
          {result.skipped > 0 ? ` ${result.skipped} skipped.` : ""}
          {result.failed > 0 ? ` ${result.failed} failed.` : ""}
          <div className="mt-1 text-xs text-emerald-100/65">
            SMS follow-up starts automatically only after the email is actually sent. The latest email date is shown on each player card below.
          </div>
          {result.errors.length > 0 ? (
            <details className="mt-3 text-xs text-amber-100/80">
              <summary className="cursor-pointer font-bold">
                Show skipped or failed details
              </summary>
              <ul className="mt-2 space-y-1 pl-4">
                {result.errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}
    </section>
  );
}
