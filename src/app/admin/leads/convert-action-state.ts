// ========================================
// File: src/app/admin/leads/convert-action-state.ts
// ========================================

export type ConvertLeadToTeamState = {
  ok: boolean;
  error: string | null;
};

export const initialConvertLeadToTeamState: ConvertLeadToTeamState = {
  ok: false,
  error: null,
};