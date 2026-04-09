// ========================================
// File: src/components/admin/teams/TeamEmailForm.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";
import { sendTeamMessageAction } from "@/app/(admin)/admin/teams/actions";

type TeamEmailTemplateOption = {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  description: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
};

type Props = {
  teamId: string;
  toEmail: string | null;
  contactName?: string | null;
  teamName: string;
  leagueName?: string | null;
  fromPath: string;
  templates: TeamEmailTemplateOption[];
  emailReplyConfigured: boolean;
};

function getFirstName(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

function resolveTeamTemplateText(
  text: string,
  context: {
    firstName: string;
    fullName: string;
    teamName: string;
    leagueName: string;
  },
) {
  return text
    .replaceAll("{{firstName}}", context.firstName)
    .replaceAll("{{fullName}}", context.fullName)
    .replaceAll("{{teamName}}", context.teamName)
    .replaceAll("{{leagueName}}", context.leagueName)
    .replaceAll("{{cta}}", "{{cta}}");
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Queueing..." : "Queue email"}
    </button>
  );
}

export default function TeamEmailForm({
  teamId,
  toEmail,
  contactName,
  teamName,
  leagueName,
  fromPath,
  templates,
  emailReplyConfigured,
}: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const templateOptions = useMemo(
    () =>
      templates.map((template) => ({
        value: template.id,
        label: template.name,
      })),
    [templates],
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const templateContext = useMemo(
    () => ({
      firstName: getFirstName(contactName),
      fullName: contactName?.trim() || "",
      teamName: teamName.trim(),
      leagueName: leagueName?.trim() || "",
    }),
    [contactName, teamName, leagueName],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      setSubject("");
      setBody("");
      return;
    }

    setSubject(resolveTeamTemplateText(selectedTemplate.subject, templateContext));
    setBody(resolveTeamTemplateText(selectedTemplate.body, templateContext));
  }, [selectedTemplate, templateContext]);

  function resetTemplate() {
    if (!selectedTemplate) {
      setSubject("");
      setBody("");
      return;
    }

    setSubject(resolveTeamTemplateText(selectedTemplate.subject, templateContext));
    setBody(resolveTeamTemplateText(selectedTemplate.body, templateContext));
  }

  return (
    <form action={sendTeamMessageAction} className="mt-4 space-y-4">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="from" value={fromPath} />
      <input type="hidden" name="channel" value="EMAIL" />
      <input
        type="hidden"
        name="ctaLabel"
        value={selectedTemplate?.ctaLabel?.trim() || ""}
      />
      <input
        type="hidden"
        name="ctaUrl"
        value={selectedTemplate?.ctaUrl?.trim() || ""}
      />
      <input
        type="hidden"
        name="templateId"
        value={selectedTemplate?.id || ""}
      />
      <input
        type="hidden"
        name="templateKey"
        value={selectedTemplate?.key || ""}
      />

      <div>
        <label className="mb-1 block text-sm text-white/70">Email template</label>

        <TemplateSelect
          label=""
          value={selectedTemplateId}
          options={templateOptions}
          onChange={(value) => setSelectedTemplateId(value)}
          disabled={!emailReplyConfigured}
          placeholder={
            templates.length > 0
              ? "Select email template"
              : "No matching templates available"
          }
        />

        {selectedTemplate?.description ? (
          <p className="mt-2 text-xs text-white/45">
            {selectedTemplate.description}
          </p>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-sm text-white/70">To</label>
        <input
          value={toEmail ?? ""}
          disabled
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white/50"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-white/70">Subject</label>
        <input
          name="subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          disabled={!emailReplyConfigured}
          placeholder="League update for your team"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm text-white/70">Message</label>
          <span className="text-xs text-white/40">Plain text email</span>
        </div>

        <div className="mt-2 rounded-xl border border-white/10 bg-black/30 transition focus-within:border-emerald-400">
          <textarea
            name="body"
            rows={9}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={!emailReplyConfigured}
            className="w-full resize-none rounded-xl bg-transparent px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={`Hi ${getFirstName(contactName) || teamName},

We wanted to update you about your team.

If you have any questions, just reply to this email.`}
          />
        </div>

        <div className="mt-2 text-xs text-white/40">
          The SIXFL footer is added automatically when the email is sent.
        </div>
      </div>

      <div className="flex gap-3">
        <SubmitButton disabled={!emailReplyConfigured || !toEmail} />

        <button
          type="button"
          onClick={resetTemplate}
          disabled={!emailReplyConfigured || !selectedTemplate}
          className="rounded-xl border border-white/10 px-4 py-2 text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset template
        </button>
      </div>
    </form>
  );
}