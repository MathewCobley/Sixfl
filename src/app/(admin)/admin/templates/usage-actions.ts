// ========================================
// File: src/app/(admin)/admin/templates/usage-actions.ts
// ========================================

"use server";

export async function markEmailTemplateUsedAction(templateId: string) {
  const trimmedTemplateId = templateId.trim();

  if (!trimmedTemplateId) {
    return { ok: true };
  }

  return { ok: true };
}
