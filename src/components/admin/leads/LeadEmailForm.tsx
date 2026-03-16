// ========================================
// File: src/components/admin/leads/LeadEmailForm.tsx
// ========================================

"use client";

import { useState } from "react";
import { sendLeadEmailAction } from "@/app/admin/leads/[id]/actions";

type Props = {
  leadId: string;
  email: string;
};

export default function LeadEmailForm({ leadId, email }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setSending(true);
    setSuccess(false);
    setError(null);

    const result = await sendLeadEmailAction(formData);

    if (result?.ok) {
      setSuccess(true);
      setSubject("");
      setBody("");
    } else {
      setError(result?.error || "Email failed to send.");
    }

    setSending(false);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="text-lg font-bold text-white">Send email</div>

      <div className="mt-1 text-sm text-white/60">
        Send directly to <span className="text-emerald-300">{email}</span>
      </div>

      <form action={handleSubmit} className="mt-4 space-y-4">
        <input type="hidden" name="leadId" value={leadId} />

        {/* SUBJECT */}
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
            placeholder="SIXFL league update"
          />
        </div>

        {/* MESSAGE */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
            Message
          </label>

          <textarea
            name="body"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-emerald-400"
            placeholder="Hi, thanks for registering interest in SIXFL..."
          />
        </div>

        {/* ERROR */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* SUCCESS */}
        {success && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            Email sent successfully.
          </div>
        )}

        {/* SEND BUTTON */}
        <button
          type="submit"
          disabled={sending}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 text-sm font-bold tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send email"}
        </button>
      </form>
    </div>
  );
}