/** Public labels only; detailed review notes stay on administrator pages. */
export const REFERRAL_INELIGIBILITY_REASONS = [
  { value: "EXISTING_TEAM", label: "Existing or renamed team" },
  { value: "DUPLICATE_REFERRAL", label: "Duplicate referral" },
  { value: "WITHDRAWN_TEAM", label: "Team withdrawn or removed" },
  { value: "TERMS_NOT_MET", label: "Referral terms not met" },
] as const;
export function referralIneligibilityLabel(code: string | null | undefined) {
  return REFERRAL_INELIGIBILITY_REASONS.find(item => item.value === code)?.label ?? "Referral terms not met";
}
export const REFERRAL_REWARD_EMAIL_SOURCES = ["team-referral-recorded", "team-referral-payout-ready"];
