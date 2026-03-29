// ========================================
// File: src/components/admin/messaging/MessagingTemplatePicker.tsx
// ========================================

"use client";

import TemplateSelect from "@/components/admin/leads/TemplateSelect";

type Template = {
  id: string;
  name: string;
  description: string | null;
};

export default function MessagingTemplatePicker({
  templates,
  value,
  onChange,
}: {
  templates: Template[];
  value: string;
  onChange: (value: string) => void;
}) {
  const selectedTemplate = templates.find((template) => template.id === value);

  return (
    <div className="space-y-2">
      <TemplateSelect
        label=""
        value={value}
        onChange={onChange}
        options={templates.map((template) => ({
          value: template.id,
          label: template.name,
        }))}
        placeholder={
          templates.length > 0 ? "Choose a template" : "No matching templates"
        }
      />

      {selectedTemplate?.description ? (
        <div className="text-xs text-white/45">{selectedTemplate.description}</div>
      ) : null}
    </div>
  );
}
