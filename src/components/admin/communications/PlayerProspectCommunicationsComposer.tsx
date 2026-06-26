// ========================================
// File: src/components/admin/communications/PlayerProspectCommunicationsComposer.tsx
// ========================================

"use client";

import { useMemo, useState } from "react";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";
import { sendUnassignedProspectCommunicationMessageAction } from "@/app/(admin)/admin/player-prospects/[prospectId]/communications/actions";

type EmailTemplateOption = {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  description: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

type SmsTemplateOption = {
  id: string;
  key: string;
  name: string;
  body: string;
  description: string | null;
};

type Props = {
  prospectId: string;
  fromPath: string;
  toEmail: string | null;
  toPhone: string | null;
  firstName: string;
  fullName: string;
  teamName: string;
  leagueName?: string | null;
  joinUrl: string;
  emailTemplates: EmailTemplateOption[];
  smsTemplates: SmsTemplateOption[];
};

function resolveText(
  text: string,
  context: {
    firstName: string;
    fullName: string;
    teamName: string;
    leagueName: string;
    joinUrl: string;
    email: string;
  },
) {
  return text
    .replaceAll("{{firstName}}", context.firstName)
    .replaceAll("{{name}}", context.fullName || context.firstName)
    .replaceAll("{{fullName}}", context.fullName || context.firstName)
    .replaceAll("{{teamName}}", context.teamName)
    .replaceAll("{{leagueName}}", context.leagueName)
    .replaceAll("{{joinUrl}}", context.joinUrl)
    .replaceAll("{{email}}", context.email);
}

export default function PlayerProspectCommunicationsComposer({
  prospectId,
  fromPath,
  toEmail,
  toPhone,
  firstName,
  fullName,
  teamName,
  leagueName,
  joinUrl,
  emailTemplates,
  smsTemplates,
}: Props) {
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [selectedSmsTemplateId, setSelectedSmsTemplateId] = useState("");
  const [smsBody, setSmsBody] = useState("");

  const templateContext = useMemo(
    () => ({
      firstName: firstName.trim(),
      fullName: fullName.trim(),
      teamName: teamName.trim(),
      leagueName: leagueName?.trim() || "",
      joinUrl: joinUrl.trim(),
      email: toEmail?.trim() || "",
    }),
    [firstName, fullName, teamName, leagueName, joinUrl, toEmail],
  );

  const selectedEmailTemplate = useMemo(
    () => emailTemplates.find((template) => template.id === selectedEmailTemplateId) ?? null,
    [emailTemplates, selectedEmailTemplateId],
  );
  const selectedSmsTemplate = useMemo(
    () => smsTemplates.find((template) => template.id === selectedSmsTemplateId) ?? null,
    [smsTemplates, selectedSmsTemplateId],
  );

  function handleEmailTemplateChange(templateId: string) {
    setSelectedEmailTemplateId(templateId);
    const template = emailTemplates.find((item) => item.id === templateId) ?? null;

    if (!template) {
      setEmailSubject("");
      setEmailBody("");
      return;
    }

    setEmailSubject(resolveText(template.subject, templateContext));
    setEmailBody(resolveText(template.body, templateContext));
  }

  function handleSmsTemplateChange(templateId: string) {
    setSelectedSmsTemplateId(templateId);
    const template = smsTemplates.find((item) => item.id === templateId) ?? null;

    if (!template) {
      setSmsBody("");
      return;
    }

    setSmsBody(resolveText(template.body, templateContext));
  }

  return (
    <div className="space-y-6">
      <form action={sendUnassignedProspectCommunicationMessageAction} className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <input type="hidden" name="prospectId" value={prospectId} />
        <input type="hidden" name="from" value={fromPath} />
        <input type="hidden" name="channel" value="EMAIL" />
        <input type="hidden" name="templateId" value={selectedEmailTemplate?.id || ""} />
        <input type="hidden" name="templateKey" value={selectedEmailTemplate?.key || ""} />
        <input type="hidden" name="ctaLabel" value={selectedEmailTemplate?.ctaLabel || ""} />
        <input type="hidden" name="ctaUrl" value={selectedEmailTemplate?.ctaUrl || ""} />

        <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">EMAIL</div>
        <div className="mt-2 text-xl font-semibold text-white">Send prospect email</div>
        <div className="mt-1 text-sm text-white/60">To: {toEmail || "No email set"}</div>

        <div className="mt-5 space-y-4">
          <TemplateSelect
            label="Email template"
            value={selectedEmailTemplateId}
            onChange={handleEmailTemplateChange}
            options={emailTemplates.map((template) => ({ value: template.id, label: template.name }))}
            placeholder="Select email template"
          />

          {selectedEmailTemplate?.description ? (
            <p className="text-xs text-white/45">{selectedEmailTemplate.description}</p>
          ) : null}

          <input
            name="subject"
            value={emailSubject}
            onChange={(event) => setEmailSubject(event.target.value)}
            placeholder="Subject"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-400"
          />
          <textarea
            name="body"
            rows={8}
            value={emailBody}
            onChange={(event) => setEmailBody(event.target.value)}
            placeholder="Hi {{firstName}}, ..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
          />
        </div>

        <button type="submit" className="mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
          Queue email
        </button>
      </form>

      <form action={sendUnassignedProspectCommunicationMessageAction} className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <input type="hidden" name="prospectId" value={prospectId} />
        <input type="hidden" name="from" value={fromPath} />
        <input type="hidden" name="channel" value="SMS" />
        <input type="hidden" name="templateId" value={selectedSmsTemplate?.id || ""} />
        <input type="hidden" name="templateKey" value={selectedSmsTemplate?.key || ""} />

        <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">SMS</div>
        <div className="mt-2 text-xl font-semibold text-white">Send prospect SMS</div>
        <div className="mt-1 text-sm text-white/60">To: {toPhone || "No mobile set"}</div>

        <div className="mt-5 space-y-4">
          <TemplateSelect
            label="SMS template"
            value={selectedSmsTemplateId}
            onChange={handleSmsTemplateChange}
            options={smsTemplates.map((template) => ({ value: template.id, label: template.name }))}
            placeholder="Select SMS template"
          />

          {selectedSmsTemplate?.description ? (
            <p className="text-xs text-white/45">{selectedSmsTemplate.description}</p>
          ) : null}

          <textarea
            name="body"
            rows={8}
            value={smsBody}
            onChange={(event) => setSmsBody(event.target.value)}
            placeholder="Hi {{firstName}}, ..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
          />
        </div>

        <button type="submit" className="mt-4 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
          Queue SMS
        </button>
      </form>
    </div>
  );
}
