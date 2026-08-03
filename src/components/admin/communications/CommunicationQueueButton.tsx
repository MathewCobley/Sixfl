"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

type QueueNotice = {
  tone: "success" | "warning";
  text: string;
};

function positiveInteger(value: string | null) {
  const parsed = Number(value ?? "0");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export default function CommunicationQueueButton({
  channel,
  disabled,
}: {
  channel: "EMAIL" | "SMS";
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  const [notice, setNotice] = useState<QueueNotice | null>(null);
  const isSms = channel === "SMS";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("channel") !== channel.toLowerCase()) {
      setNotice(null);
      return;
    }

    const saved = params.get("saved");
    const count = positiveInteger(params.get("count"));
    const duplicates = positiveInteger(params.get("duplicates"));
    const channelLabel = isSms ? "SMS" : "Email";

    if (saved === "already_queued") {
      setNotice({
        tone: "warning",
        text: `That exact ${channelLabel.toLowerCase()} was already queued or sent recently. No duplicate was created.`,
      });
      return;
    }

    if (saved === "queued") {
      const recipientLabel = `${count || 1} recipient${count === 1 ? "" : "s"}`;
      const duplicateLabel = duplicates > 0
        ? ` ${duplicates} duplicate attempt${duplicates === 1 ? " was" : "s were"} blocked.`
        : "";

      setNotice({
        tone: "success",
        text: `${channelLabel} queued successfully for ${recipientLabel}.${duplicateLabel}`,
      });
      return;
    }

    setNotice(null);
  }, [channel, isSms]);

  return (
    <div className="space-y-2">
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

      {notice ? (
        <div
          role="status"
          className={`rounded-xl border px-3 py-2 text-xs leading-5 ${
            notice.tone === "success"
              ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
              : "border-amber-400/25 bg-amber-500/10 text-amber-100"
          }`}
        >
          {notice.text}
        </div>
      ) : null}
    </div>
  );
}
