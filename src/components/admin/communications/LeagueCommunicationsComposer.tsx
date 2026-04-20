// ========================================
// File: src/components/admin/communications/LeagueCommunicationsComposer.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";

import { sendLeagueCommunicationMessageAction } from "@/app/(admin)/admin/communications/actions";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";

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
  leagueId: string;
  fromPath: string;
  leagueName: string;
  teamCount: number;
  emailTemplates: EmailTemplateOption[];
  smsTemplates: SmsTemplateOption[];
};

function resolveText(text: string, context: { leagueName: string }) {
  return text.replaceAll("{{leagueName}}", context.leagueName);
}

export default function LeagueCommunicationsComposer({
  leagueId,
  fromPath,
  leagueName,
  teamCount,
  emailTemplates,
  smsTemplates,
}: Props) {
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [selectedSmsTemplateId, setSelectedSmsTemplateId] = useState("");
  const [smsBody, setSmsBody] = useState("");

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

    setEmailSubject(resolveText(selectedEmailTemplate.subject, { leagueName }));
    setEmailBody(resolveText(selectedEmailTemplate.body, { leagueName }));
  }, [selectedEmailTemplate, leagueName]);

  useEffect(() => {
    if (!selectedSmsTemplate) {
      setSmsBody("");
      return;
    }

    setSmsBody(resolveText(selectedSmsTemplate.body, { leagueName }));
  }, [selectedSmsTemplate, leagueName]);

  return (
    <div className="space-y-6">
      <form
        action={sendLeagueCommunicationMessageAction}
        className="rounded-3xl border border-white/10 bg-white/5 p-6"
      >
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="from" value={fromPath} />
        <input type="hidden" name="channel" value="EMAIL" />
        <input type="hidden" name="templateId" value={selectedEmailTemplate?.id || ""} />
        <input type="hidden" name="templateKey" value={selectedEmailTemplate?.key || ""} />
        <input type="hidden" name="ctaLabel" value={selectedEmailTemplate?.ctaLabel || ""} />
        <input type="hidden" name="ctaUrl" value={selectedEmailTemplate?.ctaUrl || ""} />

        <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">LEAGUE EMAIL</div>
        <div className="mt-2 text-xl font-semibold text-white">Email every team in this league</div>
        <div className="mt-1 text-sm text-white/60">This will queue one email per team. Target teams: {teamCount}</div>

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
            placeholder="Write your league email..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
          />
        </div>

        <button
          type="submit"
          className="mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Queue league email
        </button>
      </form>

      <form
        action={sendLeagueCommunicationMessageAction}
        className="rounded-3xl border border-white/10 bg-white/5 p-6"
      >
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="from" value={fromPath} />
        <input type="hidden" name="channel" value="SMS" />
        <input type="hidden" name="templateId" value={selectedSmsTemplate?.id || ""} />
        <input type="hidden" name="templateKey" value={selectedSmsTemplate?.key || ""} />

        <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">LEAGUE SMS</div>
        <div className="mt-2 text-xl font-semibold text-white">Text every team in this league</div>
        <div className="mt-1 text-sm text-white/60">This will queue one SMS per team with a mobile number. Target teams: {teamCount}</div>

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
            placeholder="Write your league SMS..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
          />
        </div>

        <button
          type="submit"
          className="mt-4 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Queue league SMS
        </button>
      </form>
    </div>
  );
}
