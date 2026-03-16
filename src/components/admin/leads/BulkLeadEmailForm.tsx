// ========================================
// File: src/components/admin/leads/BulkLeadEmailForm.tsx
// ========================================

"use client";

import { useState } from "react";
import { sendBulkLeadEmailAction } from "@/app/admin/leads/actions";

type Props = {
  selectedType?: string;
  selectedStatus?: string;
  selectedArea?: string;
  selectedNight?: string;
  recipientCount: number;
};

export default function BulkLeadEmailForm({
  selectedType,
  selectedStatus,
  selectedArea,
  selectedNight,
  recipientCount,
}: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setSending(true);
    setSuccess(null);
    setError(null);

    const result = await sendBulkLeadEmailAction(formData);

    if (result?.ok) {
      setSuccess(
        `Bulk email complete. Sent: ${result.sentCount}. Failed: ${result.failedCount}.`
      );
      setSubject("");
      setBody("");
    } else {
      setError(result?.error || "Bulk email failed.");
    }

    setSending(false);
  }

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-lg font-bold text-white">
            Bulk email filtered leads
          </div>
          <div className="mt-1 text-sm text-white/65">
            This sends to the leads currently matching your filters.
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/75">
          Recipients:{" "}
          <span className="font-bold text-white">{recipientCount}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
          Type: {selectedType || "All"}
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
          Status: {selectedStatus || "All"}
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
          Area: {selectedArea || "All"}
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
          Night: {selectedNight || "All"}
        </span>
      </div>

      <form action={handleSubmit} className="mt-5 space-y-4">
        <input type="hidden" name="type" value={selectedType ?? ""} />
        <input type="hidden" name="status" value={selectedStatus ?? ""} />
        <input type="hidden" name="area" value={selectedArea ?? ""} />
        <input type="hidden" name="night" value={selectedNight ?? ""} />

        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
            Subject
          </label>
          <input
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-white outline-none focus:border-emerald-400"
            placeholder="SIXFL launch update"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
            Message
          </label>
          <textarea
            name="body"
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-emerald-400"
            placeholder="Hi, thanks for registering interest in SIXFL..."
          />
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {success}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={sending || recipientCount === 0}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 text-sm font-bold tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {sending ? "Sending bulk email..." : "Send bulk email"}
        </button>
      </form>
    </div>
  );
}