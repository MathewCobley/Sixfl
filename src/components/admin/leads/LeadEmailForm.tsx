// ========================================
// File: src/components/admin/leads/LeadEmailForm.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";
import { sendLeadEmailWithResponseLinksAction } from "@/app/(admin)/admin/leads/[id]/response-email-actions";
import { sendTeamCommitmentEmailAction } from "@/app/(admin)/admin/leads/team-commitment-email-actions";
import {
  buildBaseEmailTemplateContext,
  mergeEmailTemplateContext,
  resolveTemplateText,
} from "@/lib/email/template-context";
import type { InterestType } from "@prisma/client";

type LeadEmailTemplateOption = {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  description: string | null;
  interestType: InterestType | null;
  ctaLabel?: string | null;
  ctaUrlKey?: string | null;
};

type ManagedTeamOption = {
  value: string;
  label: string;
};

type Props = {
  leadId: string;
  email: string | null;
  firstName?: string | null;
  fullName?: string | null;
  area?: string | null;
  signupUrl?: string | null;
  templates: LeadEmailTemplateOption[];
  managedTeamOptions: ManagedTeamOption[];
  showTeamConfirmationShortcut?: boolean;
};

const RESPONSE_TOKEN_PLACEHOLDERS = {
  yes: "__SIXFL_YES_RESPONSE_URL__",
  no: "__SIXFL_NO_RESPONSE_URL__",
} as const;

const SERVER_TOKEN_PLACEHOLDERS: Record<string, string> = {
  leagueName: "__SIXFL_LEAGUE_NAME__",
  leagueStartLine: "__SIXFL_LEAGUE_START_LINE__",
  leagueDetailsBlock: "__SIXFL_LEAGUE_DETAILS_BLOCK__",
  proposedStartDate: "__SIXFL_PROPOSED_START_DATE__",
  venueName: "__SIXFL_VENUE_NAME__",
  kickoffInfo: "__SIXFL_KICKOFF_INFO__",
  format: "__SIXFL_FORMAT__",
  minutesPerGame: "__SIXFL_MINUTES_PER_GAME__",
  costPerTeamPerMatch: "__SIXFL_COST_PER_TEAM_PER_MATCH__",
  targetTeamCount: "__SIXFL_TARGET_TEAM_COUNT__",
  targetTeamCountLine: "__SIXFL_TARGET_TEAM_COUNT_LINE__",
};

function protectLeadResponseTokens(value: string) {
  return value
    .replaceAll("{{yesResponseUrl}}", RESPONSE_TOKEN_PLACEHOLDERS.yes)
    .replaceAll("{{noResponseUrl}}", RESPONSE_TOKEN_PLACEHOLDERS.no);
}

function restoreLeadResponseTokens(value: string) {
  return value
    .replaceAll(RESPONSE_TOKEN_PLACEHOLDERS.yes, "{{yesResponseUrl}}")
    .replaceAll(RESPONSE_TOKEN_PLACEHOLDERS.no, "{{noResponseUrl}}");
}

function protectServerResolvedTokens(value: string) {
  return Object.entries(SERVER_TOKEN_PLACEHOLDERS).reduce(
    (current, [key, placeholder]) =>
      current.replace(new RegExp(`{{\\s*${key}\\s*}}`, "gi"), placeholder),
    value,
  );
}

function restoreServerResolvedTokens(value: string) {
  return Object.entries(SERVER_TOKEN_PLACEHOLDERS).reduce(
    (current, [key, placeholder]) =>
      current.replaceAll(placeholder, `{{${key}}}`),
    value,
  );
}

export default function LeadEmailForm({
  leadId,
  email,
  firstName,
  fullName,
  area,
  signupUrl,
  templates,
  managedTeamOptions,
  showTeamConfirmationShortcut = false,
}: Props) {
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [targetTeamId, setTargetTeamId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const templateOptions = useMemo(
    () => templates.map((template) => ({ value: template.id, label: template.name })),
    [templates],
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const requiresManagedTeam = selectedTemplate?.ctaUrlKey === "teamJoinUrl";

  const templateContext = useMemo(() => {
    const derivedFullName = fullName?.trim() || firstName?.trim() || "";
    return mergeEmailTemplateContext(
      buildBaseEmailTemplateContext({
        firstName,
        fullName: derivedFullName,
        area,
        signupUrl,
      }),
    );
  }, [firstName, fullName, area, signupUrl]);

  useEffect(() => {
    if (!requiresManagedTeam) {
      setTargetTeamId("");
      return;
    }
    if (!targetTeamId && managedTeamOptions.length > 0) {
      setTargetTeamId(managedTeamOptions[0].value);
    }
  }, [managedTeamOptions, requiresManagedTeam, targetTeamId]);

  function resolveTemplateForLead(value: string) {
    return restoreServerResolvedTokens(
      restoreLeadResponseTokens(
        resolveTemplateText(
          protectServerResolvedTokens(protectLeadResponseTokens(value)),
          templateContext,
        ),
      ),
    );
  }

  function handleTemplateChange(value: string) {
    setSelectedTemplateId(value);
    const template = templates.find((item) => item.id === value) ?? null;
    if (!template) {
      setSubject("");
      setBody("");
      return;
    }
    setSubject(resolveTemplateForLead(template.subject));
    setBody(resolveTemplateForLead(template.body));
  }

  async function handleQuickConfirmationSend() {
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("leadId", leadId);
      const result = await sendTeamCommitmentEmailAction(formData);
      if (!result?.ok) {
        alert(result?.error || "Failed to send the team decision email.");
        return;
      }
      alert(
        "Team decision email sent. The lead will only be asked for their decision, team name and approximate squad size.",
      );
      router.refresh();
    } catch {
      alert("Something went wrong while sending the team decision email.");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("leadId", leadId);
      formData.append("templateId", selectedTemplateId);
      formData.append("subject", subject);
      formData.append("body", body);
      formData.append("signupUrl", signupUrl ?? "");
      formData.append("ctaLabel", selectedTemplate?.ctaLabel?.trim() || "");
      formData.append("ctaUrlKey", selectedTemplate?.ctaUrlKey?.trim() || "");
      formData.append("targetTeamId", targetTeamId);

      const result = await sendLeadEmailWithResponseLinksAction(formData);
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
    setSubject(resolveTemplateForLead(selectedTemplate.subject));
    setBody(resolveTemplateForLead(selectedTemplate.body));
  }

  return (
    <div className="space-y-4">
      {showTeamConfirmationShortcut ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
          <div className="text-sm font-semibold text-emerald-50">Team decision link</div>
          <p className="mt-1 text-sm leading-6 text-emerald-100/75">
            Send a secure link that recognises the existing lead. It asks only whether they want to enter, their team name and approximate squad size.
          </p>
          <button
            type="button"
            onClick={handleQuickConfirmationSend}
            disabled={sending || !email}
            className="mt-3 inline-flex rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send team decision email"}
          </button>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-6"
      >
        <div>
          <label className="mb-1 block text-sm text-white/70">Email template</label>
          <TemplateSelect
            label=""
            value={selectedTemplateId}
            options={templateOptions}
            onChange={handleTemplateChange}
            disabled={sending}
            placeholder={templates.length > 0 ? "Select email template" : "No matching templates available"}
          />
          {selectedTemplate?.description ? (
            <p className="mt-2 text-xs text-white/45">{selectedTemplate.description}</p>
          ) : null}
        </div>

        {requiresManagedTeam ? (
          <div>
            <label className="mb-1 block text-sm text-white/70">Managed team link</label>
            <TemplateSelect
              label=""
              value={targetTeamId}
              options={managedTeamOptions}
              onChange={(value) => setTargetTeamId(value)}
              disabled={sending}
              placeholder={
                managedTeamOptions.length > 0
                  ? "Choose managed team"
                  : "No managed recruiting teams available"
              }
            />
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-sm text-white/70">To</label>
          <input
            type="email"
            value={email ?? ""}
            disabled
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white/50"
          />
        </div>

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
              placeholder={`Hi ${firstName || "there"},\n\nThanks for your interest in SIXFL...\n\nWe’ll be in touch shortly.`}
            />
          </div>
          <div className="mt-2 text-xs text-white/40">This email will be sent directly to the lead.</div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={sending || !email || (requiresManagedTeam && !targetTeamId)}
            className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send email"}
          </button>
          <button
            type="button"
            onClick={resetTemplate}
            disabled={sending || !selectedTemplate}
            className="rounded-xl border border-white/10 px-4 py-2 text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset template
          </button>
        </div>
      </form>
    </div>
  );
}
