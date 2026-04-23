// ========================================
// File: src/components/admin/messaging/AdminMessagingConsole.tsx
// ========================================

"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AdminMessagingActionState } from "@/app/(admin)/admin/messaging/actions";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import MessagingTemplatePicker from "./MessagingTemplatePicker";
import MessagingRecipientPreview from "./MessagingRecipientPreview";

type Template = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  subject: string;
  body: string;
  interestType: "TEAM" | "PLAYER" | "REFEREE" | null;
  ctaLabel: string | null;
  ctaUrlKey: string | null;
};

type Recipient = {
  id: string;
  contactName: string | null;
  email: string;
  area: string | null;
  interestType: "TEAM" | "PLAYER" | "REFEREE";
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED";
};

type RecentEmail = {
  id: string;
  subject: string;
  sentTo: string;
  sentAt: string;
  interestLead: {
    id: string;
    contactName: string | null;
    interestType: "TEAM" | "PLAYER" | "REFEREE";
  } | null;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-500 px-6 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Sending campaign..." : "Send campaign"}
    </button>
  );
}

function formatUkDateTime(value: string) {
  return formatDateTimeInLondon(new Date(value), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminMessagingConsole({
  templates,
  recipients,
  recentEmails,
  areaOptions,
  selectedType,
  selectedStatus,
  selectedArea,
  selectedNight,
  action,
}: {
  templates: Template[];
  recipients: Recipient[];
  recentEmails: RecentEmail[];
  areaOptions: string[];
  selectedType?: "TEAM" | "PLAYER" | "REFEREE";
  selectedStatus?: "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED";
  selectedArea?: string;
  selectedNight?:
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY"
    | "ANY";
  action: (
    prevState: AdminMessagingActionState,
    formData: FormData
  ) => Promise<AdminMessagingActionState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrlKey, setCtaUrlKey] = useState("");
  const [includedLeadIds, setIncludedLeadIds] = useState<string[]>([]);

  const filteredTemplates = useMemo(() => {
    if (!selectedType) return templates;
    return templates.filter(
      (template) => !template.interestType || template.interestType === selectedType
    );
  }, [templates, selectedType]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId]
  );

  useEffect(() => {
    setIncludedLeadIds(recipients.map((recipient) => recipient.id));
  }, [recipients]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setSubject(selectedTemplate.subject);
    setBody(selectedTemplate.body);
    setCtaLabel(selectedTemplate.ctaLabel ?? "");
    setCtaUrlKey(selectedTemplate.ctaUrlKey ?? "");
  }, [selectedTemplate]);

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);

    if (!template) {
      setSubject("");
      setBody("");
      setCtaLabel("");
      setCtaUrlKey("");
      return;
    }

    setSubject(template.subject);
    setBody(template.body);
    setCtaLabel(template.ctaLabel ?? "");
    setCtaUrlKey(template.ctaUrlKey ?? "");
  }

  function toggleLead(id: string) {
    setIncludedLeadIds((current) =>
      current.includes(id)
        ? current.filter((leadId) => leadId !== id)
        : [...current, id]
    );
  }

  const selectedRecipients = recipients.filter((recipient) =>
    includedLeadIds.includes(recipient.id)
  );

  const canSend =
    selectedRecipients.length > 0 &&
    subject.trim().length > 0 &&
    body.trim().length > 0;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Admin messaging
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Messaging console
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
                Centralised lead campaigns using your live SIXFL templates and branded email renderer.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/leads"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
            >
              Open leads
            </Link>
            <Link
              href="/admin/email-templates"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
            >
              Manage templates
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-8 2xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <form
          action={formAction}
          className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
        >
          <div className="border-b border-white/10 px-6 py-6 md:px-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Compose
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              New lead campaign
            </h2>
          </div>

          <div className="space-y-6 px-6 py-6 md:px-8">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                  Current filters
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">Type: {selectedType || "All"}</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">Status: {selectedStatus || "All"}</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">Area: {selectedArea || "All"}</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">Night: {selectedNight || "All"}</span>
                </div>
                <div className="mt-3 text-xs text-white/40">Areas in current data: {areaOptions.length}</div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                  Template
                </div>
                <MessagingTemplatePicker
                  templates={filteredTemplates}
                  value={selectedTemplateId}
                  onChange={handleTemplateChange}
                />
              </div>
            </div>

            <input type="hidden" name="ctaUrlKey" value={ctaUrlKey} />
            {includedLeadIds.map((id) => (
              <input key={id} type="hidden" name="includedLeadIds" value={id} />
            ))}

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                Subject
              </label>
              <input
                name="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/50"
                placeholder="SIXFL update"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                  Message
                </label>
                <span className="text-xs text-white/35">Uses your lead variables and CTA token</span>
              </div>
              <textarea
                name="body"
                rows={16}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-white outline-none transition focus:border-emerald-500/50"
                placeholder="Write your campaign..."
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                CTA label
              </label>
              <input
                name="ctaLabel"
                value={ctaLabel}
                onChange={(event) => setCtaLabel(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/50"
                placeholder="Register your interest"
              />
            </div>

            {state?.ok ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                Campaign complete. Sent {state.sentCount ?? 0}. Failed {state.failedCount ?? 0}.
              </div>
            ) : null}

            {!state?.ok && state?.error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {state.error}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <SubmitButton disabled={!canSend} />
              <div className="inline-flex h-12 items-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white/65">
                Selected recipients: {selectedRecipients.length}
              </div>
            </div>
          </div>
        </form>

        <div className="space-y-8">
          <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
            <div className="border-b border-white/10 px-6 py-6 md:px-8">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Recipient preview</h2>
              <p className="mt-2 text-sm text-white/50">Review and exclude recipients before sending.</p>
            </div>

            <div className="px-6 py-6 md:px-8">
              <MessagingRecipientPreview
                recipients={recipients}
                selectedIds={includedLeadIds}
                onToggle={toggleLead}
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
            <div className="border-b border-white/10 px-6 py-6 md:px-8">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Recent sends</h2>
            </div>

            <div className="divide-y divide-white/5">
              {recentEmails.length === 0 ? (
                <div className="px-6 py-8 text-sm text-white/50 md:px-8">No recent lead emails yet.</div>
              ) : (
                recentEmails.map((email) => (
                  <div key={email.id} className="px-6 py-4 md:px-8">
                    <div className="text-sm font-semibold text-white">{email.subject}</div>
                    <div className="mt-1 text-sm text-white/55">{email.sentTo}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
                      <span>{formatUkDateTime(email.sentAt)}</span>
                      {email.interestLead?.interestType ? <span>{email.interestLead.interestType}</span> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
