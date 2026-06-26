// ========================================
// File: src/components/captain/prospects/ProspectTemplateMessageForm.tsx
// ========================================

"use client";

import { useMemo, useState } from "react";

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

type ProspectTemplate = EmailTemplate | SmsTemplate;

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

function isEmailTemplate(template: ProspectTemplate): template is EmailTemplate {
  return "subject" in template && typeof template.subject === "string";
}

function getPanelClasses(variant: "primary" | "secondary") {
  return variant === "secondary"
    ? "border-sky-400/20 bg-sky-500/10"
    : "border-emerald-400/20 bg-emerald-500/10";
}

function getButtonClasses(variant: "primary" | "secondary") {
  return variant === "secondary"
    ? "bg-sky-300 text-black hover:bg-sky-200"
    : "bg-emerald-400 text-black hover:bg-emerald-300";
}

function getTemplateButtonClasses(isSelected: boolean) {
  return [
    "rounded-xl border px-3 py-2 text-left text-xs transition",
    isSelected
      ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-50"
      : "border-white/10 bg-black/20 text-white/65 hover:border-white/20 hover:bg-white/5 hover:text-white",
  ].join(" ");
}

export default function ProspectTemplateMessageForm({
  channel,
  title,
  subtitle,
  action,
  hiddenFields,
  emailTemplates = [],
  smsTemplates = [],
  placeholderSubject = "Message subject",
  placeholderBody = "Type your message here...",
  submitLabel,
  variant = "primary",
  applyPersonalization = true,
}: Props) {
  const templates = useMemo<ProspectTemplate[]>(
    () => (channel === "EMAIL" ? emailTemplates : smsTemplates),
    [channel, emailTemplates, smsTemplates],
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  function applyTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);

    if (!template) {
      return;
    }

    setSelectedTemplateId(template.id);

    if (channel === "EMAIL" && isEmailTemplate(template)) {
      setSubject(template.subject);
    }

    setBody(template.body);
  }

  return (
    <section className={`rounded-2xl border p-4 ${getPanelClasses(variant)}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          {subtitle ? (
            <p className="mt-1 text-sm leading-6 text-white/65">{subtitle}</p>
          ) : null}
        </div>
        <span className="inline-flex w-fit rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          {channel}
        </span>
      </div>

      {templates.length > 0 ? (
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
            Templates
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template.id)}
                className={getTemplateButtonClasses(selectedTemplateId === template.id)}
              >
                <span className="block font-semibold">{template.name}</span>
                {template.description ? (
                  <span className="mt-1 block leading-5 opacity-75">{template.description}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55">
          No {channel === "EMAIL" ? "email" : "SMS"} templates are active yet. You can still type a custom message.
        </div>
      )}

      <form action={action} className="mt-4 space-y-3">
        {hiddenFields.map((field, index) => (
          <input
            key={`${field.name}-${field.value}-${index}`}
            type="hidden"
            name={field.name}
            value={field.value}
          />
        ))}

        {channel === "EMAIL" ? (
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
              Subject
            </span>
            <input
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={placeholderSubject}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-400/50"
            />
          </label>
        ) : null}

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
            Message
          </span>
          <textarea
            name="body"
            rows={channel === "EMAIL" ? 7 : 5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={placeholderBody}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/35 focus:border-emerald-400/50"
          />
        </label>

        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/55">
          {applyPersonalization
            ? "You can use {{firstName}}, {{name}}, {{teamName}} and {{joinUrl}}. These are filled in when the message is queued."
            : "For bulk messages, placeholders are filled separately for each prospect when the message is queued."}
        </div>

        <button
          type="submit"
          className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:w-auto ${getButtonClasses(variant)}`}
        >
          {submitLabel}
        </button>
      </form>
    </section>
  );
}
