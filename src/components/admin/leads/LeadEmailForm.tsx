// ========================================
// File: src/components/admin/leads/LeadEmailForm.tsx
// ========================================

"use client";

// ========================================
// Imports
// ========================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";
import { sendLeadEmailAction } from "@/app/admin/leads/[id]/actions";
import {
  getSixflLeadEmailTemplate,
  type LeadEmailTemplateKey,
} from "@/lib/emailTemplates";

// ========================================
// Types
// ========================================

type Props = {
  leadId: string;
  email: string;
  firstName?: string | null;
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

export default function LeadEmailForm({
  leadId,
  email,
  firstName,
}: Props) {
  // ========================================
  // Router
  // ========================================

  const router = useRouter();

  // ========================================
  // State
  // ========================================

  const [selectedTemplate, setSelectedTemplate] =
    useState<LeadEmailTemplateKey | "">("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

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
      firstName: firstName ?? undefined,
    });

    setSubject(template.subject);
    setBody(template.body);
  }, [selectedTemplate, firstName]);

  // ========================================
  // Handlers
  // ========================================

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);

    try {
      const formData = new FormData();
      formData.append("leadId", leadId);
      formData.append("subject", subject);
      formData.append("body", body);

      const result = await sendLeadEmailAction(formData);

      if (!result?.ok) {
        alert(result?.error || "Failed to send email.");
        return;
      }

      alert("Email sent successfully.");
      router.refresh();
    } catch {
      alert("Something went wrong while sending the email.");
    } finally {
      setSending(false);
    }
  }

  function resetTemplate() {
    if (!selectedTemplate) {
      setSubject("");
      setBody("");
      return;
    }

    const template = getSixflLeadEmailTemplate(selectedTemplate, {
      firstName: firstName ?? undefined,
    });

    setSubject(template.subject);
    setBody(template.body);
  }

  // ========================================
  // UI
  // ========================================

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-6"
    >
      {/* ========================================
          Template Selector
      ======================================== */}
      <div>
        <label className="mb-1 block text-sm text-white/70">
          Email template
        </label>

        <TemplateSelect
          label=""
          value={selectedTemplate}
          options={templateOptions}
          onChange={(value) =>
            setSelectedTemplate(value as LeadEmailTemplateKey | "")
          }
          disabled={sending}
          placeholder="Select email template"
        />
      </div>

      {/* ========================================
          To Field
      ======================================== */}
      <div>
        <label className="mb-1 block text-sm text-white/70">To</label>
        <input
          type="email"
          value={email}
          disabled
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white/50"
        />
      </div>

      {/* ========================================
          Subject Field
      ======================================== */}
      <div>
        <label className="mb-1 block text-sm text-white/70">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={sending}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="SIXFL launch update"
        />
      </div>

      {/* ========================================
          Message Field
      ======================================== */}
      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm text-white/70">Message</label>
          <span className="text-xs text-white/40">Plain text email</span>
        </div>

        <div className="mt-2 rounded-xl border border-white/10 bg-black/30 transition focus-within:border-emerald-400">
          <textarea
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
            className="w-full resize-none rounded-xl bg-transparent px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={`Hi ${firstName || "there"},

Thanks for your interest in SIXFL...

We’ll be in touch shortly.`}
          />
        </div>

        <div className="mt-2 text-xs text-white/40">
          This email will be sent directly to the lead.
        </div>
      </div>

      {/* ========================================
          Actions
      ======================================== */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={sending}
          className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send email"}
        </button>

        <button
          type="button"
          onClick={resetTemplate}
          disabled={sending}
          className="rounded-xl border border-white/10 px-4 py-2 text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset template
        </button>
      </div>
    </form>
  );
}