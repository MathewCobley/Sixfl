// ========================================
// File: src/components/admin/leads/BulkLeadSmsForm.tsx
// ========================================

"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import TemplateSelect from "./TemplateSelect";

type Template = {
  id: string;
  key: string;
  label: string;
  body: string;
  description?: string | null;
  interestType: string | null;
  ctaUrlKey?: string | null;
};

type ManagedTeamOption = {
  value: string;
  label: string;
};

type RecipientPreviewItem = {
  id: string;
  contactName: string | null;
  phone: string;
};

type BulkSmsActionState = {
  ok?: boolean;
  error?: string;
  sentCount?: number;
  failedCount?: number;
};

type Props = {
  templates: Template[];
  selectedType?: string | undefined;
  selectedStatus?: string | undefined;
  selectedArea?: string | undefined;
  selectedNight?: string | undefined;
  recipientCount: number;
  recipientPreview: RecipientPreviewItem[];
  managedTeamOptions: ManagedTeamOption[];
  action: any;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Sending..." : "Send SMS"}
    </button>
  );
}

export default function BulkLeadSmsForm({
  templates,
  selectedType,
  selectedStatus,
  selectedArea,
  selectedNight,
  recipientCount,
  recipientPreview,
  managedTeamOptions,
  action,
}: Props) {
  const [state, formAction] = useActionState(action, {} as BulkSmsActionState);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [body, setBody] = useState("");
  const [targetTeamId, setTargetTeamId] = useState("");
  const [includedLeadIds, setIncludedLeadIds] = useState<string[]>([]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      if (!selectedType) return true;
      return !template.interestType || template.interestType === selectedType;
    });
  }, [templates, selectedType]);

  const templateOptions = filteredTemplates.map((template) => ({
    value: template.id,
    label: template.label,
  }));

  const selectedTemplateRecord = useMemo(
    () => templates.find((item) => item.id === selectedTemplate) ?? null,
    [templates, selectedTemplate],
  );

  const selectedPreviewCount = includedLeadIds.length;
  const requiresManagedTeam = selectedTemplateRecord?.ctaUrlKey === "teamJoinUrl";

  useEffect(() => {
    setIncludedLeadIds(recipientPreview.map((recipient) => recipient.id));
  }, [recipientPreview]);

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
    if (state?.ok) {
      setSelectedTemplate("");
      setBody("");
      setTargetTeamId("");
    }
  }, [state?.ok]);

  function handleTemplateChange(templateId: string) {
    setSelectedTemplate(templateId);

    const template = templates.find((item) => item.id === templateId);
    if (!template) {
      setBody("");
      setTargetTeamId("");
      return;
    }

    setBody(template.body);
    setTargetTeamId(
      template.ctaUrlKey === "teamJoinUrl"
        ? managedTeamOptions[0]?.value || ""
        : "",
    );
  }

  function toggleLead(id: string) {
    setIncludedLeadIds((current) =>
      current.includes(id)
        ? current.filter((leadId) => leadId !== id)
        : [...current, id],
    );
  }

  const canSubmit = Boolean(
    body.trim() &&
      selectedPreviewCount > 0 &&
      (!requiresManagedTeam || Boolean(targetTeamId)),
  );

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[11px] font-bold tracking-[0.2em] text-white/55">SMS</div>

      <input type="hidden" name="templateId" value={selectedTemplate} />
      <input type="hidden" name="templateCtaUrlKey" value={selectedTemplateRecord?.ctaUrlKey ?? ""} />
      <input type="hidden" name="targetTeamId" value={targetTeamId} />
      <input type="hidden" name="selectedType" value={selectedType ?? ""} />
      <input type="hidden" name="selectedStatus" value={selectedStatus ?? ""} />
      <input type="hidden" name="selectedArea" value={selectedArea ?? ""} />
      <input type="hidden" name="selectedNight" value={selectedNight ?? ""} />

      {includedLeadIds.map((id) => (
        <input key={id} type="hidden" name="includedLeadIds" value={id} />
      ))}

      <TemplateSelect
        value={selectedTemplate}
        onChange={handleTemplateChange}
        options={templateOptions}
        placeholder="Choose SMS template"
      />

      {selectedTemplateRecord?.description ? (
        <div className="text-xs text-white/45">{selectedTemplateRecord.description}</div>
      ) : null}

      {requiresManagedTeam ? (
        <TemplateSelect
          label="Managed team link"
          value={targetTeamId}
          onChange={setTargetTeamId}
          options={managedTeamOptions}
          placeholder="Choose managed team"
        />
      ) : null}

      <textarea
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write your SMS..."
        rows={6}
        className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-emerald-500 focus:outline-none"
      />

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Recipient preview</div>
          <div className="text-sm text-white/60">
            <span className="font-semibold text-white">{selectedPreviewCount}</span> selected from preview • <span className="font-semibold text-white">{recipientCount}</span> total matching leads
          </div>
        </div>

        {recipientPreview.length === 0 ? (
          <div className="mt-3 text-sm text-white/60">No recipients match the current filters.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {recipientPreview.map((recipient) => {
              const checked = includedLeadIds.includes(recipient.id);

              return (
                <label key={recipient.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.05]">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLead(recipient.id)}
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-black text-emerald-500 focus:ring-emerald-500"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{recipient.contactName || "Unnamed lead"}</div>
                    <div className="break-all text-sm text-white/55">{recipient.phone}</div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-sm text-white/60">
        This will send to <span className="font-semibold text-white">{selectedPreviewCount}</span> selected lead{selectedPreviewCount === 1 ? "" : "s"} from the preview.
      </div>

      {state?.ok ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          SMS queued. {state.sentCount ?? 0} queued{typeof state.failedCount === "number" ? `, ${state.failedCount} failed.` : "."}
        </div>
      ) : null}

      {!state?.ok && state?.error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{state.error}</div>
      ) : null}

      <SubmitButton disabled={!canSubmit} />
    </form>
  );
}
