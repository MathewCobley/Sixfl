// ========================================
// File: src/components/admin/communications/TeamCommunicationsComposer.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";
import { sendTeamCommunicationMessageAction } from "@/app/(admin)/admin/communications/actions";

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
  teamId: string;
  fromPath: string;
  toEmail: string | null;
  toPhone: string | null;
  contactName?: string | null;
  teamName: string;
  leagueName?: string | null;
  claimCode?: string | null;
  claimLink?: string | null;
  captainDashboardUrl?: string | null;
  emailTemplates: EmailTemplateOption[];
  smsTemplates: SmsTemplateOption[];
};

function getFirstName(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

function resolveText(
  text: string,
  context: {
    firstName: string;
    fullName: string;
    teamName: string;
    leagueName: string;
    claimCode: string;
    claimLink: string;
    captainDashboardUrl: string;
  },
) {
  return text
    .replaceAll("{{firstName}}", context.firstName)
    .replaceAll("{{fullName}}", context.fullName)
    .replaceAll("{{teamName}}", context.teamName)
    .replaceAll("{{leagueName}}", context.leagueName)
    .replaceAll("{{claimCode}}", context.claimCode)
    .replaceAll("{{claimLink}}", context.claimLink)
    .replaceAll("{{captainDashboardUrl}}", context.captainDashboardUrl);
}

export default function TeamCommunicationsComposer({
  teamId,
  fromPath,
  toEmail,
  toPhone,
  contactName,
  teamName,
  leagueName,
  claimCode,
  claimLink,
  captainDashboardUrl,
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
      firstName: getFirstName(contactName),
      fullName: contactName?.trim() || "",
      teamName: teamName.trim(),
      leagueName: leagueName?.trim() || "",
      claimCode: claimCode?.trim() || "",
      claimLink: claimLink?.trim() || "",
      captainDashboardUrl: captainDashboardUrl?.trim() || claimLink?.trim() || "",
    }),
    [captainDashboardUrl, claimCode, claimLink, contactName, leagueName, teamName],
  );

  const selectedEmailTemplate = useMemo(
    () => emailTemplates.find((template) => template.id === selectedEmailTemplateId) ?? null,
    [emailTemplates, selectedEmailTemplateId],
  );
  const selectedSmsTemplate = useMemo(
    () => smsTemplates.find((template) => template.id === selectedSmsTemplateId) ?? null,
    [smsTemplates, selectedSmsTemplateId],
  );

  useEffect(() => {
    if (!selectedEmailTemplate) {
      setEmailSubject("");
      setEmailBody("");
      return;
    }

    setEmailSubject(resolveText(selectedEmailTemplate.subject, templateContext));
    setEmailBody(resolveText(selectedEmailTemplate.body, templateContext));
  }, [selectedEmailTemplate, templateContext]);

  useEffect(() => {
    if (!selectedSmsTemplate) {
      setSmsBody("");
      return;
    }

    setSmsBody(resolveText(selectedSmsTemplate.body, templateContext));
  }, [selectedSmsTemplate, templateContext]);

  return (
    <div className="space-y-6">
      <form
        action={sendTeamCommunicationMessageAction}
        className="rounded-3xl border border-white/10 bg-white/5 p-6"
      >
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="from" value={fromPath} />
        <input type="hidden" name="channel" value="EMAIL" />
        <input type="hidden" name="templateId" value={selectedEmailTemplate?.id || ""} />
        <input type="hidden" name="templateKey" value={selectedEmailTemplate?.key || ""} />
        <input type="hidden" name="ctaLabel" value={selectedEmailTemplate?.ctaLabel || ""} />
        <input type="hidden" name="ctaUrl" value={selectedEmailTemplate?.ctaUrl || ""} />

        <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">EMAIL</div>
        <div className="mt-2 text-xl font-semibold text-white">Send team email</div>
        <div className="mt-1 text-sm text-white/60">To: {toEmail || "No email set"}</div>

        <div className="mt-5 space-y-4">
          <TemplateSelect
            label="Email template"
            value={selectedEmailTemplateId}
            onChange={setSelectedEmailTemplateId}
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
            placeholder="Write your message..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
          />
        </div>

        <button
          type="submit"
          className="mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Queue email
        </button>
      </form>

      <form
        action={sendTeamCommunicationMessageAction}
        className="rounded-3xl border border-white/10 bg-white/5 p-6"
      >
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="from" value={fromPath} />
        <input type="hidden" name="channel" value="SMS" />
        <input type="hidden" name="templateId" value={selectedSmsTemplate?.id || ""} />
        <input type="hidden" name="templateKey" value={selectedSmsTemplate?.key || ""} />

        <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">SMS</div>
        <div className="mt-2 text-xl font-semibold text-white">Send team SMS</div>
        <div className="mt-1 text-sm text-white/60">To: {toPhone || "No mobile set"}</div>

        <div className="mt-5 space-y-4">
          <TemplateSelect
            label="SMS template"
            value={selectedSmsTemplateId}
            onChange={setSelectedSmsTemplateId}
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
            placeholder="Write your SMS..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
          />
        </div>

        <button
          type="submit"
          className="mt-4 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Queue SMS
        </button>
      </form>
    </div>
  );
}
