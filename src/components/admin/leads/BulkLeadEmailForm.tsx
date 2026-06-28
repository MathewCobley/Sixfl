// ========================================
// File: src/components/admin/leads/BulkLeadEmailForm.tsx
// ========================================

"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import FormListboxField from "@/components/ui/FormListboxField";
import TemplateSelect from "./TemplateSelect";

type Template = {
  id: string;
  key: string;
  label: string;
  subject: string;
  body: string;
  interestType: "TEAM" | "PLAYER" | "REFEREE" | null;
  ctaLabel?: string | null;
  ctaUrlKey?: string | null;
};

type RecipientPreviewItem = {
  id: string;
  contactName: string | null;
  email: string;
};

type BulkEmailActionState = {
  ok?: boolean;
  error?: string;
  sentCount?: number;
  failedCount?: number;
};

type ManagedTeamOption = {
  value: string;
  label: string;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Sending bulk email..." : "Send bulk email"}
    </button>
  );
}

export default function BulkLeadEmailForm({
  templates,
  selectedType,
  selectedStatus,
  selectedArea,
  selectedNight,
  recipientCount,
  recipientPreview,
  managedTeamOptions,
  action,
}: {
  templates: Template[];
  selectedType?: "TEAM" | "PLAYER" | "REFEREE";
  selectedStatus?: "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED";
  selectedArea?: string;
  selectedNight?:
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY"
    | "ANY";
  recipientCount: number;
  recipientPreview: RecipientPreviewItem[];
  managedTeamOptions: ManagedTeamOption[];
  action: (
    prevState: BulkEmailActionState,
    formData: FormData,
  ) => Promise<BulkEmailActionState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [includedLeadIds, setIncludedLeadIds] = useState<string[]>([]);
  const [targetTeamId, setTargetTeamId] = useState("");

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (!selectedType) return true;
      return !t.interestType || t.interestType === selectedType;
    });
  }, [templates, selectedType]);

  const templateOptions = filteredTemplates.map((t) => ({
    value: t.id,
    label: t.label,
  }));

  const selectedTemplateRecord = useMemo(
    () => templates.find((t) => t.id === selectedTemplate) ?? null,
    [templates, selectedTemplate],
  );

  const templateNeedsTeamJoinTarget =
    selectedTemplateRecord?.ctaUrlKey === "teamJoinUrl";

  useEffect(() => {
    setIncludedLeadIds(recipientPreview.map((recipient) => recipient.id));
  }, [recipientPreview]);

  useEffect(() => {
    if (state?.ok) {
      setSelectedTemplate("");
      setSubject("");
      setBody("");
      setTargetTeamId("");
    }
  }, [state?.ok]);

  useEffect(() => {
    if (!templateNeedsTeamJoinTarget) {
      setTargetTeamId("");
    }
  }, [templateNeedsTeamJoinTarget]);

  function handleTemplateChange(templateId: string) {
    setSelectedTemplate(templateId);

    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    setSubject(template.subject);
    setBody(template.body);
  }

  function toggleLead(id: string) {
    setIncludedLeadIds((current) =>
      current.includes(id)
        ? current.filter((leadId) => leadId !== id)
        : [...current, id],
    );
  }

  const selectedPreviewCount = includedLeadIds.length;

  const canSubmit = Boolean(
    subject.trim() &&
      body.trim() &&
      selectedPreviewCount > 0 &&
      (!templateNeedsTeamJoinTarget || targetTeamId.trim()),
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
    >
      <div className="text-[11px] font-bold tracking-[0.2em] text-white/55">
        BULK EMAIL
      </div>

      <input type="hidden" name="templateId" value={selectedTemplate} />
      <input type="hidden" name="templateKey" value={selectedTemplateRecord?.key ?? ""} />
      <input
        type="hidden"
        name="ctaLabel"
        value={selectedTemplateRecord?.ctaLabel ?? ""}
      />
      <input
        type="hidden"
        name="ctaUrlKey"
        value={selectedTemplateRecord?.ctaUrlKey ?? ""}
      />
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
        placeholder="Choose a template"
      />

      {templateNeedsTeamJoinTarget ? (
        <div>
          <FormListboxField
            name="targetTeamId"
            label="Target managed team"
            value={targetTeamId}
            options={managedTeamOptions}
            placeholder="Select managed team"
          />
          <div className="mt-2 text-xs text-white/45">
            Choose which managed team this email should link to.
          </div>
        </div>
      ) : null}

      <input
        name="subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Email subject"
        className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-emerald-500 focus:outline-none"
      />

      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your message..."
        rows={8}
        className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-emerald-500 focus:outline-none"
      />

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
            Recipient preview
          </div>
          <div className="text-sm text-white/60">
            <span className="font-semibold text-white">{selectedPreviewCount}</span>{" "}
            selected from preview •{" "}
            <span className="font-semibold text-white">{recipientCount}</span>{" "}
            total matching leads
          </div>
        </div>

        {recipientPreview.length === 0 ? (
          <div className="mt-3 text-sm text-white/60">
            No recipients match the current filters.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {recipientPreview.map((recipient) => {
              const checked = includedLeadIds.includes(recipient.id);

              return (
                <label
                  key={recipient.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.05]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLead(recipient.id)}
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-black text-emerald-500 focus:ring-emerald-500"
                  />

                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">
                      {recipient.contactName || "Unnamed lead"}
                    </div>
                    <div className="break-all text-sm text-white/55">
                      {recipient.email}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {recipientCount > recipientPreview.length ? (
          <div className="mt-3 text-xs text-white/45">
            Only the first {recipientPreview.length} matching recipients are shown
            here for manual exclusion preview.
          </div>
        ) : null}
      </div>

      <div className="text-sm text-white/60">
        This will send to{" "}
        <span className="font-semibold text-white">{selectedPreviewCount}</span>{" "}
        selected lead{selectedPreviewCount === 1 ? "" : "s"} from the preview.
      </div>

      {state?.ok ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Bulk email sent. {state.sentCount ?? 0} sent
          {typeof state.failedCount === "number"
            ? `, ${state.failedCount} failed.`
            : "."}
        </div>
      ) : null}

      {!state?.ok && state?.error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {state.error}
        </div>
      ) : null}

      <SubmitButton disabled={!canSubmit} />
    </form>
  );
}
