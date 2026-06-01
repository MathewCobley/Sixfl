// ========================================
// File: src/components/captain/prospects/ProspectTemplateMessageForm.tsx
// ========================================

"use client";

type EmailTemplate = {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  description: string | null;
};

type SmsTemplate = {
  id: string;
  key: string;
  name: string;
  body: string;
  description: string | null;
};

type HiddenField = {
  name: string;
  value: string;
};

type Props = {
  channel: "EMAIL" | "SMS";
  title: string;
  subtitle?: string;
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields: HiddenField[];
  emailTemplates?: EmailTemplate[];
  smsTemplates?: SmsTemplate[];
  placeholderSubject?: string;
  placeholderBody?: string;
  submitLabel: string;
  variant?: "primary" | "secondary";
  applyPersonalization?: boolean;
};

export default function ProspectTemplateMessageForm({
  channel,
  title,
}: Props) {
  return (
    <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
      <div className="text-sm font-semibold text-amber-100">{title}</div>
      <p className="mt-2 text-sm leading-6 text-amber-50/75">
        Prospect messaging is now handled by SIXFL admin. Captains can update prospect details,
        notes and statuses here, but they cannot send prospect emails/SMS or use SIXFL message
        templates from the captain hub.
      </p>
      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55">
        {channel === "EMAIL"
          ? "Email templates are admin-only. Ask SIXFL admin to send prospect emails."
          : "SMS templates are admin-only. Ask SIXFL admin to send prospect SMS messages."}
      </div>
    </section>
  );
}
