// ========================================
// File: src/components/admin/teams/TeamEmailForm.tsx
// ========================================

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  claimCode: string;
  claimLink: string;
  captainDashboardUrl: string;
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
    .replaceAll("{{captainDashboardUrl}}", context.captainDashboardUrl)
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
  claimCode,
  claimLink,
  captainDashboardUrl,
  fromPath,
  templates,
  emailReplyConfigured,
}: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");

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
      claimCode: claimCode.trim(),
      claimLink: claimLink.trim(),
      captainDashboardUrl: captainDashboardUrl.trim(),
    }),
    [
      captainDashboardUrl,
      claimCode,
      claimLink,
      contactName,
      leagueName,
      teamName,
    ],
  );

  const selectedTemplateNeedsDynamicCtaUrl = Boolean(
    selectedTemplate?.ctaLabel?.trim() && !selectedTemplate?.ctaUrl?.trim(),
  );

  const resolvedCtaUrl = selectedTemplateNeedsDynamicCtaUrl
    ? paymentUrl.trim()
    : selectedTemplate?.ctaUrl?.trim() || "";

  const canSubmit = Boolean(
    emailReplyConfigured &&
      toEmail &&
      (!selectedTemplateNeedsDynamicCtaUrl || paymentUrl.trim()),
  );

  function handleTemplateChange(value: string) {
    setSelectedTemplateId(value);

    const template = templates.find((item) => item.id === value) ?? null;

    if (!template) {
      setSubject("");
      setBody("");
      setPaymentUrl("");
      return;
    }

    setSubject(resolveTeamTemplateText(template.subject, templateContext));
    setBody(resolveTeamTemplateText(template.body, templateContext));
    setPaymentUrl("");
  }

  function resetTemplate() {
    if (!selectedTemplate) {
      setSubject("");
      setBody("");
      setPaymentUrl("");
      return;
    }

    setSubject(resolveTeamTemplateText(selectedTemplate.subject, templateContext));
    setBody(resolveTeamTemplateText(selectedTemplate.body, templateContext));
    setPaymentUrl("");
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
      <input type="hidden" name="ctaUrl" value={resolvedCtaUrl} />
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
          onChange={handleTemplateChange}
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

        <div className="mt-1 text-xs text-white/35">
          Captain access templates can use{" "}
          <span className="font-mono text-white/60">{"{{claimCode}}"}</span>,{" "}
          <span className="font-mono text-white/60">{"{{claimLink}}"}</span>,
          and{" "}
          <span className="font-mono text-white/60">
            {"{{captainDashboardUrl}}"}
          </span>
          .
        </div>
      </div>

      {selectedTemplate?.ctaLabel?.trim() ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
            Template button
          </div>

          <div className="mt-2 text-sm text-white/80">
            Button label:{" "}
            <span className="font-medium text-white">
              {selectedTemplate.ctaLabel.trim()}
            </span>
          </div>

          {selectedTemplateNeedsDynamicCtaUrl ? (
            <div className="mt-4 space-y-2">
              <label className="block text-sm text-white/70">
                Payment link
              </label>
              <input
                type="url"
                value={paymentUrl}
                onChange={(event) => setPaymentUrl(event.target.value)}
                disabled={!emailReplyConfigured}
                placeholder="https://buy.stripe.com/..."
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="text-xs text-white/45">
                This template needs a payment link when you send it. Paste the
                Stripe payment URL here.
              </div>
            </div>
          ) : selectedTemplate.ctaUrl?.trim() ? (
            <div className="mt-3 text-xs text-white/45">
              This template button will use:{" "}
              <span className="break-all text-emerald-300">
                {selectedTemplate.ctaUrl.trim()}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <SubmitButton disabled={!canSubmit} />

        <button
          type="button"
          onClick={resetTemplate}
          disabled={!emailReplyConfigured || !selectedTemplate}
          className="rounded-xl border border-white/10 px-4 py-2 text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset template
        </button>

        <Link
          href={`/admin/teams/${teamId}/communications`}
          className="rounded-xl border border-white/10 px-4 py-2 text-white transition hover:bg-white/5"
        >
          Open communications hub
        </Link>
      </div>
    </form>
  );
}
