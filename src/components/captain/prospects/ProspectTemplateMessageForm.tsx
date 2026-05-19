// ========================================
// File: src/components/captain/prospects/ProspectTemplateMessageForm.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";

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

function personaliseText(
  text: string,
  context: {
    firstName: string;
    fullName: string;
    teamName: string;
    joinUrl: string;
    email: string;
  },
) {
  return text
    .replace(/{{firstName}}/gi, context.firstName)
    .replace(/{{name}}/gi, context.fullName || context.firstName)
    .replace(/{{fullName}}/gi, context.fullName || context.firstName)
    .replace(/{{teamName}}/gi, context.teamName)
    .replace(/{{joinUrl}}/gi, context.joinUrl)
    .replace(/{{email}}/gi, context.email);
}

function buildSignupEmailPreset(context: {
  firstName: string;
  teamName: string;
}) {
  return {
    subject: `Join ${context.teamName} on SIXFL`,
    body: `Hi ${context.firstName || "there"},\n\nYou've been added to ${context.teamName}'s SIXFL squad list.\n\nPlease use the button below to register as a player so we can link you to the team properly.\n\n{{cta}}\n\nThanks,\nSIXFL`,
  };
}

export default function ProspectTemplateMessageForm({
  channel,
  title,
  subtitle,
  action,
  hiddenFields,
  emailTemplates = [],
  smsTemplates = [],
  placeholderSubject = "Subject",
  placeholderBody = "Hi {{firstName}}, ...",
  submitLabel,
  variant = "primary",
  applyPersonalization = true,
}: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const context = useMemo(() => {
    const get = (name: string) => hiddenFields.find((field) => field.name === name)?.value ?? "";
    return {
      firstName: get("prospectFirstName") || "there",
      fullName: get("prospectFullName") || get("prospectFirstName") || "there",
      teamName: get("teamName") || "SIXFL",
      joinUrl: get("joinUrl") || "https://www.sixfl.co.uk/register-interest",
      email: get("prospectEmail") || "",
    };
  }, [hiddenFields]);

  const isIndividualProspectEmail =
    channel === "EMAIL" && hiddenFields.some((field) => field.name === "prospectId");

  const signupEmailPreset = useMemo(
    () => buildSignupEmailPreset({ firstName: context.firstName, teamName: context.teamName }),
    [context.firstName, context.teamName],
  );

  const templates = channel === "EMAIL" ? emailTemplates : smsTemplates;
  const templateOptions = templates.map((template) => ({
    value: template.id,
    label: template.name,
  }));

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  useEffect(() => {
    if (!isIndividualProspectEmail || selectedTemplateId) return;

    setSubject(signupEmailPreset.subject);
    setBody(signupEmailPreset.body);
  }, [isIndividualProspectEmail, selectedTemplateId, signupEmailPreset]);

  useEffect(() => {
    if (!selectedTemplate) return;

    if (channel === "EMAIL") {
      const template = selectedTemplate as EmailTemplate;
      setSubject(
        applyPersonalization
          ? personaliseText(template.subject, context)
          : template.subject,
      );
      setBody(
        applyPersonalization ? personaliseText(template.body, context) : template.body,
      );
      return;
    }

    const template = selectedTemplate as SmsTemplate;
    setBody(
      applyPersonalization ? personaliseText(template.body, context) : template.body,
    );
  }, [applyPersonalization, channel, context, selectedTemplate]);

  function useSignupEmailPreset() {
    setSelectedTemplateId("");
    setSubject(signupEmailPreset.subject);
    setBody(signupEmailPreset.body);
  }

  const buttonClass =
    variant === "primary"
      ? "mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
      : "mt-4 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10";

  return (
    <form action={action} className="rounded-2xl border border-white/10 bg-black/20 p-4">
      {hiddenFields.map((field, index) => (
        <input key={`${field.name}-${index}`} type="hidden" name={field.name} value={field.value} />
      ))}

      <div className="text-sm font-semibold text-white">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-white/45">{subtitle}</div> : null}

      {isIndividualProspectEmail ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/80">
            Quick signup email
          </div>
          <p className="mt-2 text-xs leading-5 text-emerald-50/70">
            This pre-fills a simple player registration email with the team signup button.
          </p>
          <button
            type="button"
            onClick={useSignupEmailPreset}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
          >
            Use signup email
          </button>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <TemplateSelect
          label={channel === "EMAIL" ? "Email template" : "SMS template"}
          value={selectedTemplateId}
          options={templateOptions}
          onChange={setSelectedTemplateId}
          placeholder={channel === "EMAIL" ? "Choose email template" : "Choose SMS template"}
        />

        {selectedTemplate?.description ? (
          <div className="text-xs text-white/45">{selectedTemplate.description}</div>
        ) : null}

        {channel === "EMAIL" ? (
          <input
            name="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={placeholderSubject}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-400"
          />
        ) : null}

        <textarea
          name="body"
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={placeholderBody}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
        />
      </div>

      <button type="submit" className={buttonClass}>
        {isIndividualProspectEmail ? "Send signup email" : submitLabel}
      </button>
    </form>
  );
}
