// Administrative response tracking only. Never use this flag to move a team,
// withdraw it, change fixtures/payments, or infer that a message was sent.
export const TEAM_MOVE_CONFIRMATION_OPTIONS = [
  { value: "PENDING", label: "Awaiting confirmation" },
  { value: "CONFIRMED", label: "Confirmed — OK to move" },
  { value: "DECLINED", label: "Not moving" },
] as const;

export type TeamMoveConfirmationStatus =
  (typeof TEAM_MOVE_CONFIRMATION_OPTIONS)[number]["value"];

export function isTeamMoveConfirmationStatus(value: unknown): value is TeamMoveConfirmationStatus {
  return TEAM_MOVE_CONFIRMATION_OPTIONS.some(option => option.value === value);
}

export function teamMoveConfirmationLabel(value: TeamMoveConfirmationStatus): string {
  return TEAM_MOVE_CONFIRMATION_OPTIONS.find(option => option.value === value)!.label;
}

export type TeamMoveConfirmationResult =
  | { ok: true; status: TeamMoveConfirmationStatus; updatedAt: string; updatedBy: string }
  | { ok: false; error: string };
