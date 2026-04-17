// ========================================
// File: src/components/admin/leads/LeadSmsForm.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";
import { sendLeadSmsAction } from "@/app/(admin)/admin/leads/[id]/actions";
import {
  buildBaseEmailTemplateContext,
  mergeEmailTemplateContext,
  resolveTemplateText,
} from "@/lib/email/template-context";

type LeadSmsTemplateOption = {
  id: string;
  key: string;
  name: string;
  body: string;
  description: string | null;
  ctaUrlKey?: string | null;
};

type ManagedTeamOption = {
  value: string;
  label: string;
};

type Props = {
  leadId: string;
  phone: string | null;
  firstName?: string | null;
  fullName?: string | null;
  area?: string | null;
  signupUrl?: string | null;
  templates: LeadSmsTemplateOption[];
  managedTeamOptions?: ManagedTeamOption[];
};

function resolveSmsLink(input: {
  ctaUrlKey?: string | null;
  signupUrl?: string | null;
  targetTeamId?: string | null;
  managedTeamOptions?: ManagedTeamOption[];
}) {
  const urlKey = input.ctaUrlKey?.trim() || "";

  if (urlKey === "signupUrl") {
    return input.signupUrl?.trim() || "";
  }

  if (urlKey === "teamJoinUrl") {
    const selectedTeam = input.managedTeamOptions?.find(
      (team) => team.value === input.targetTeamId,
    );

    if (selectedTeam) {
      return `Selected managed team: ${selectedTeam.label}`;
    }
  }

  return "";
}

export default function LeadSmsForm({
  leadId,
  phone,
  firstName,
  fullName,
  area,
  signupUrl,
  templates,
  managedTeamOptions = [],
}: Props) {
  const router = useRouter();

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [targetTeamId, setTargetTeamId] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const templateOptions = useMemo(
    () =>
      templates.map((template) => ({
        value: template.id,
        label: template.name,
      })),
    [templates],
  );

  const managedTeamSelectOptions = useMemo(
    () =>
      managedTeamOptions.map((team) => ({
        value: team.value,
        label: team.label,
      })),
    [managedTeamOptions],
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

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

  const requiresManagedTeam = selectedTemplate?.ctaUrlKey === "teamJoinUrl";

  useEffect(() => {
    if (!requiresManagedTeam) {
      setTargetTeamId("");
      return;
    }

    if (!targetTeamId && managedTeamOptions.length > 0) {
      setTargetTeamId(managedTeamOptions[0].value);
    }
  }, [managedTeamOptions, requiresManagedTeam, targetTeamId]);

  useEffect(() => {
    if (!selectedTemplate) {
      setBody("");
      return;
    }

    const resolvedLink = resolveSmsLink({
      ctaUrlKey: selectedTemplate.ctaUrlKey,
      signupUrl,
      targetTeamId,
      managedTeamOptions,
    });

    setBody(
      resolveTemplateText(selectedTemplate.body, templateContext).replace(
        /{{link}}/gi,
        resolvedLink,
      ),
    );
  }, [selectedTemplate, signupUrl, targetTeamId, managedTeamOptions, templateContext]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);

    try {
      const formData = new FormData();
      formData.append("leadId", leadId);
      formData.append("body", body);
      formData.append("signupUrl", signupUrl ?? "");
      formData.append("ctaUrlKey", selectedTemplate?.ctaUrlKey?.trim() || "");
      formData.append("targetTeamId", targetTeamId);

      const result = await sendLeadSmsAction(formData);

      if (!result?.ok) {
        alert(result?.error || "Failed to send SMS.");
        return;
      }

      alert("SMS queued successfully.");
      router.refresh();
    } catch {
      alert("Something went wrong while sending the SMS.");
    } finally {
      setSending(false);
    }
  }

  function resetTemplate() {
    if (!selectedTemplate) {
      setBody("");
      return;
    }

    const resolvedLink = resolveSmsLink({
      ctaUrlKey: selectedTemplate.ctaUrlKey,
      signupUrl,
      targetTeamId,
      managedTeamOptions,
    });

    setBody(
      resolveTemplateText(selectedTemplate.body, templateContext).replace(
        /{{link}}/gi,
        resolvedLink,
      ),
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-6"
    >
      <div>
        <label className="mb-1 block text-sm text-white/70">SMS template</label>

        <TemplateSelect
          label=""
          value={selectedTemplateId}
          options={templateOptions}
          onChange={(value) => setSelectedTemplateId(value)}
          disabled={sending}
          placeholder={
            templates.length > 0
              ? "Select SMS template"
              : "No matching SMS templates available"
          }
        />

        {selectedTemplate?.description ? (
          <p className="mt-2 text-xs text-white/45">
            {selectedTemplate.description}
          </p>
        ) : null}
      </div>

      {requiresManagedTeam ? (
        <div>
          <TemplateSelect
            label="Managed team link"
            value={targetTeamId}
            options={managedTeamSelectOptions}
            onChange={setTargetTeamId}
            disabled={sending}
            placeholder="Select managed team"
          />
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-sm text-white/70">To</label>
        <input
          type="text"
          value={phone ?? ""}
          disabled
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white/50"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm text-white/70">Message</label>
          <span className="text-xs text-white/40">SMS</span>
        </div>

        <div className="mt-2 rounded-xl border border-white/10 bg-black/30 transition focus-within:border-emerald-400">
          <textarea
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
            className="w-full resize-none rounded-xl bg-transparent px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={`Hi ${firstName || "there"},\n\nWe’re launching a new SIXFL team in your area. Reply YES if you want the details.`}
          />
        </div>

        <div className="mt-2 text-xs text-white/40">
          This SMS will be queued directly to the lead.
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={sending || !phone || (requiresManagedTeam && !targetTeamId)}
          className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send SMS"}
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
  );
}
