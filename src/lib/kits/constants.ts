// ========================================
// File: src/lib/kits/constants.ts
// ========================================

export const TEAM_KIT_QUANTITY = 9;
export const TEAM_KIT_MAX_QUANTITY = 99;

export const TEAM_KIT_SIZE_OPTIONS = [
  { value: "S", label: "Small (S)" },
  { value: "M", label: "Medium (M)" },
  { value: "L", label: "Large (L)" },
  { value: "XL", label: "Extra large (XL)" },
  { value: "XXL", label: "2XL" },
] as const;

export const TEAM_KIT_SOCK_SIZE_OPTIONS = [
  { value: "MEDIUM_6_8", label: "Medium — shoe size 6–8" },
  { value: "LARGE_8_PLUS", label: "Large — shoe size 8+" },
] as const;

export const TEAM_KIT_SIZE_GUIDE = [
  { size: "S", lengthCm: 69, chestCm: 100, heightCm: "165–170" },
  { size: "M", lengthCm: 73, chestCm: 106, heightCm: "170–175" },
  { size: "L", lengthCm: 76, chestCm: 112, heightCm: "175–180" },
  { size: "XL", lengthCm: 79, chestCm: 118, heightCm: "180–185" },
  { size: "2XL", lengthCm: 81, chestCm: 124, heightCm: "185–190" },
] as const;

export const TEAM_KIT_ORDER_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "ORDERED",
  "FULFILLED",
  "CANCELLED",
] as const;

export type TeamKitSize = (typeof TEAM_KIT_SIZE_OPTIONS)[number]["value"];
export type TeamKitSockSize =
  (typeof TEAM_KIT_SOCK_SIZE_OPTIONS)[number]["value"];
export type TeamKitOrderStatus = (typeof TEAM_KIT_ORDER_STATUSES)[number];

export function isTeamKitSize(value: string): value is TeamKitSize {
  return TEAM_KIT_SIZE_OPTIONS.some((option) => option.value === value);
}

export function isTeamKitSockSize(value: string): value is TeamKitSockSize {
  return TEAM_KIT_SOCK_SIZE_OPTIONS.some((option) => option.value === value);
}

export function isTeamKitOrderStatus(
  value: string,
): value is TeamKitOrderStatus {
  return TEAM_KIT_ORDER_STATUSES.includes(value as TeamKitOrderStatus);
}

export function getTeamKitStatusLabel(status: TeamKitOrderStatus) {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "SUBMITTED":
      return "Submitted";
    case "APPROVED":
      return "Approved";
    case "ORDERED":
      return "Ordered from supplier";
    case "FULFILLED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
  }
}

export function getTeamKitSizeLabel(size: TeamKitSize) {
  return (
    TEAM_KIT_SIZE_OPTIONS.find((option) => option.value === size)?.label ?? size
  );
}

export function getTeamKitSockSizeLabel(size: TeamKitSockSize) {
  return (
    TEAM_KIT_SOCK_SIZE_OPTIONS.find((option) => option.value === size)?.label ??
    size
  );
}
