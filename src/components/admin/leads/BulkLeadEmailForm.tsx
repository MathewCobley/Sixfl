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

const BULK_SEND_CONFIRM_TEXT = "BULK SEND";

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
    useState<LeadEmailTemplateKey | "">("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");

  const hasRecipients = recipientCount > 0;
  const hasSubject = subject.trim().length > 0;
  const hasBody = body.trim().length > 0;
  const canStartBulkSend = hasRecipients && hasSubject && hasBody && !sending;
  const isConfirmationMatch =
    confirmationText.trim() === BULK_SEND_CONFIRM_TEXT;

  // ========================================
  // Effects
  // ========================================

  useEffect(() => {
    if (!selectedTemplate) {
      setSubject("");
      setBody("");
      return;
    }

    const template = getSixflLeadEmailTemplate(selectedTemplate, {
      firstName: undefined,
    });

    setSubject(template.subject);
    setBody(template.body);
  }, [selectedTemplate]);

  // ========================================
  // Helpers
  // ========================================

  function closeConfirmation() {
    setShowConfirmation(false);
    setConfirmationText("");
  }

  function resetConfirmationIfOpen() {
    if (showConfirmation) {
      setShowConfirmation(false);
      setConfirmationText("");
    }
  }

  // ========================================
  // Handlers
  // ========================================

  async function handleSubmit(formData: FormData) {
    if (!showConfirmation || !isConfirmationMatch || !canStartBulkSend) {
      return;
    }

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

      if (selectedTemplate) {
        const template = getSixflLeadEmailTemplate(selectedTemplate, {
          firstName: undefined,
        });

        setSubject(template.subject);
        setBody(template.body);
      } else {
        setSubject("");
        setBody("");
      }

      closeConfirmation();
    } else {
      setError(result?.error || "Bulk email failed.");
    }

    setSending(false);
  }

  function resetTemplate() {
    if (!selectedTemplate) {
      setSubject("");
      setBody("");
      resetConfirmationIfOpen();
      return;
    }

    const template = getSixflLeadEmailTemplate(selectedTemplate, {
      firstName: undefined,
    });

    setSubject(template.subject);
    setBody(template.body);
    resetConfirmationIfOpen();
  }

  function openConfirmation() {
    if (!canStartBulkSend) return;

    setError(null);
    setSuccess(null);
    setShowConfirmation(true);
    setConfirmationText("");
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
        <input
          type="hidden"
          name="confirmBulkSend"
          value={showConfirmation && isConfirmationMatch ? "yes" : ""}
        />

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
              onChange={(value) => {
                setSelectedTemplate(value as LeadEmailTemplateKey | "");
                resetConfirmationIfOpen();
              }}
              disabled={sending || !hasRecipients}
              placeholder="Select email template"
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
            onChange={(e) => {
              setSubject(e.target.value);
              resetConfirmationIfOpen();
            }}
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
            <span className="text-xs text-white/40">Plain text email</span>
          </div>

          <div className="mt-2 rounded-xl border border-white/10 bg-black/30 transition focus-within:border-emerald-400">
            <textarea
              name="body"
              rows={12}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                resetConfirmationIfOpen();
              }}
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
            Confirmation Panel
        ======================================== */}
        {showConfirmation ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300/85">
              Final confirmation
            </div>

            <div className="mt-2 text-sm leading-6 text-white/80">
              You are about to send this bulk email to{" "}
              <span className="font-bold text-white">{recipientCount}</span>{" "}
              {recipientCount === 1 ? "recipient" : "recipients"}.
            </div>

            <div className="mt-3 text-sm leading-6 text-white/70">
              To confirm, type{" "}
              <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-bold text-white">
                {BULK_SEND_CONFIRM_TEXT}
              </span>{" "}
              below.
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                Confirmation text
              </label>
              <input
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                disabled={sending}
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={BULK_SEND_CONFIRM_TEXT}
              />
            </div>

            <div className="mt-2 text-xs text-white/45">
              The final send button stays disabled until the text matches
              exactly.
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={sending || !isConfirmationMatch || !hasRecipients}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 text-sm font-bold tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending
                  ? "Sending bulk email..."
                  : `Confirm send to ${recipientCount} ${
                      recipientCount === 1 ? "recipient" : "recipients"
                    }`}
              </button>

              <button
                type="button"
                onClick={closeConfirmation}
                disabled={sending}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-6 text-sm font-bold tracking-[0.12em] text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

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
          {!showConfirmation ? (
            <button
              type="button"
              onClick={openConfirmation}
              disabled={sending || !hasRecipients || !hasSubject || !hasBody}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 text-sm font-bold tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {hasRecipients ? "Send bulk email" : "No matching recipients"}
            </button>
          ) : null}

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