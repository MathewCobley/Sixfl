// ========================================
// File: src/components/admin/leads/BulkLeadEmailForm.tsx
// ========================================

"use client";

// ========================================
// Imports
// ========================================

import { useEffect, useState } from "react";
import { sendBulkLeadEmailAction } from "@/app/admin/leads/actions";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";
import {
  getSixflLeadEmailTemplate,
  type LeadEmailTemplateKey,
} from "@/lib/emailTemplates";

// ========================================
// Types
// ========================================

type Props = {
  selectedType?: string;
  selectedStatus?: string;
  selectedArea?: string;
  selectedNight?: string;
  recipientCount: number;
};

const templateOptions: { value: LeadEmailTemplateKey; label: string }[] = [
  { value: "lead-response", label: "Lead response" },
  { value: "team-follow-up", label: "Team follow-up" },
  { value: "player-follow-up", label: "Player follow-up" },
  { value: "referee-follow-up", label: "Referee follow-up" },
];

// ========================================
// Component
// ========================================

export default function BulkLeadEmailForm({
  selectedType,
  selectedStatus,
  selectedArea,
  selectedNight,
  recipientCount,
}: Props) {
  // ========================================
  // State
  // ========================================

  const [selectedTemplate, setSelectedTemplate] =
    useState<LeadEmailTemplateKey>("lead-response");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasRecipients = recipientCount > 0;

  // ========================================
  // Effects
  // ========================================

  useEffect(() => {
    const template = getSixflLeadEmailTemplate(selectedTemplate, {
      firstName: undefined,
    });

    setSubject(template.subject);
    setBody(template.body);
  }, [selectedTemplate]);

  // ========================================
  // Handlers
  // ========================================

  async function handleSubmit(formData: FormData) {
    setSending(true);
    setSuccess(null);
    setError(null);

    const result = await sendBulkLeadEmailAction(formData);

    if (result?.ok) {
      const allSent = result.failedCount === 0;

      setSuccess(
        allSent
          ? `All ${result.sentCount} emails were sent individually with no shared recipient visibility.`
          : `Bulk email complete. Sent: ${result.sentCount}. Failed: ${result.failedCount}. All emails are still sent individually.`
      );

      const template = getSixflLeadEmailTemplate(selectedTemplate, {
        firstName: undefined,
      });

      setSubject(template.subject);
      setBody(template.body);
    } else {
      setError(result?.error || "Bulk email failed.");
    }

    setSending(false);
  }

  function resetTemplate() {
    const template = getSixflLeadEmailTemplate(selectedTemplate, {
      firstName: undefined,
    });

    setSubject(template.subject);
    setBody(template.body);
  }

  // ========================================
  // UI
  // ========================================

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
      {/* ========================================
          Header
      ======================================== */}
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

      {/* ========================================
          Filter Summary
      ======================================== */}
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
          Preferred night: {selectedNight || "All"}
        </span>
      </div>

      {/* ========================================
          Privacy Note
      ======================================== */}
      <div className="mt-4 rounded-xl border border-emerald-500/20 bg-black/20 px-4 py-3 text-sm text-white/75">
        <div className="font-semibold text-emerald-300">Privacy note</div>
        <div className="mt-1 leading-6">
          Emails are sent individually to each lead. Recipients will not see
          other recipients&apos; email addresses.
        </div>
      </div>

      {/* ========================================
          Empty State
      ======================================== */}
      {!hasRecipients ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          No leads match the current filters, so bulk email is currently
          disabled.
        </div>
      ) : null}

      {/* ========================================
          Form
      ======================================== */}
      <form action={handleSubmit} className="mt-5 space-y-4">
        <input type="hidden" name="type" value={selectedType ?? ""} />
        <input type="hidden" name="status" value={selectedStatus ?? ""} />
        <input type="hidden" name="area" value={selectedArea ?? ""} />
        <input type="hidden" name="night" value={selectedNight ?? ""} />

        {/* ========================================
            Template Selector
        ======================================== */}
        <div>
          <div className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
            Email template
          </div>

          <div className="mt-2">
            <TemplateSelect
              label=""
              value={selectedTemplate}
              options={templateOptions}
              onChange={(value) =>
                setSelectedTemplate(value as LeadEmailTemplateKey)
              }
              disabled={sending || !hasRecipients} // ✅ FIXED
            />
          </div>
        </div>

        {/* ========================================
            Subject Field
        ======================================== */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
            Subject
          </label>
          <input
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            disabled={sending || !hasRecipients}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-white outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="SIXFL launch update"
          />
        </div>

        {/* ========================================
    Message Field
======================================== */}
<div>
  <div className="flex items-center justify-between">
    <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
      Message
    </label>
    <span className="text-xs text-white/40">
      Plain text email
    </span>
  </div>

  <div className="mt-2 rounded-xl border border-white/10 bg-black/30 focus-within:border-emerald-400 transition">
    <textarea
      name="body"
      rows={12}
      value={body}
      onChange={(e) => setBody(e.target.value)}
      required
      disabled={sending || !hasRecipients}
      className="w-full resize-none rounded-xl bg-transparent px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed disabled:opacity-50"
      placeholder={`Hi there,

Thanks for your interest in SIXFL...

We’ll be in touch shortly with next steps.`}
    />
  </div>

  <div className="mt-2 text-xs text-white/40">
    Tip: Keep emails short and clear for better response rates.
  </div>
</div>

        {/* ========================================
            Feedback Messages
        ======================================== */}
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

        {/* ========================================
            Actions
        ======================================== */}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={sending || !hasRecipients}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 text-sm font-bold tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending
              ? "Sending bulk email..."
              : hasRecipients
              ? "Send bulk email"
              : "No matching recipients"}
          </button>

          <button
            type="button"
            onClick={resetTemplate}
            disabled={sending || !hasRecipients}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-6 text-sm font-bold tracking-[0.12em] text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset template
          </button>
        </div>
      </form>
    </div>
  );
}