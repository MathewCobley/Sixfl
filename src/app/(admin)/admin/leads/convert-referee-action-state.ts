// ========================================
// File: src/app/admin/leads/convert-referee-action-state.ts
// ========================================

export type ConvertLeadToRefereeState = {
    ok: boolean;
    error: string | null;
  };
  
  export const initialConvertLeadToRefereeState: ConvertLeadToRefereeState = {
    ok: false,
    error: null,
  };