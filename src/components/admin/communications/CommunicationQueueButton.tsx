"use client";

import { useFormStatus } from "react-dom";

export default function CommunicationQueueButton({
  channel,
  disabled,
}: {
  channel: "EMAIL" | "SMS";
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  const isSms = channel === "SMS";

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
      aria-live="polite"
      className={`inline-flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        isSms
          ? "border-sky-400/30 bg-sky-500/10 text-sky-100 hover:bg-sky-500/15"
          : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
      }`}
    >
      {pending
        ? isSms
          ? "Queuing SMS… please do not click again"
          : "Queuing email… please do not click again"
        : isSms
          ? "Queue SMS"
          : "Queue email"}
    </button>
  );
}
