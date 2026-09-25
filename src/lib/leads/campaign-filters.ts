import type { Prisma } from "@prisma/client";
import { EXPANSION_LEAD_SOURCE } from "@/lib/expansion-leads";

export const LEAD_TYPES = ["TEAM", "PLAYER", "REFEREE"] as const;
export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CLOSED"] as const;
export const LEAD_NIGHTS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", "ANY"] as const;
export const LEAD_FILTER_KEYS = ["type", "status", "excludeType", "excludeStatus", "area", "night", "league"] as const;
export type LeadCampaignFilters = {
  type: "" | typeof LEAD_TYPES[number];
  status: "" | typeof LEAD_STATUSES[number];
  excludeType: "" | typeof LEAD_TYPES[number];
  excludeStatus: "" | typeof LEAD_STATUSES[number];
  area: string;
  night: "" | typeof LEAD_NIGHTS[number];
  league: string;
};
export const EMPTY_LEAD_FILTERS: LeadCampaignFilters = { type: "", status: "", excludeType: "", excludeStatus: "", area: "", night: "", league: "" };
export type LeadCampaignChannel = "EMAIL" | "SMS";
export type LeadCampaignRecipient = {
  id: string; contactName: string; email: string | null; phone: string | null;
  interestType: string; status: string; area: string | null; leagueLabel: string;
};
export type LeadCampaignTemplate = {
  id: string; key: string; label: string; channel: LeadCampaignChannel;
  subject: string; body: string; interestType: string | null;
  ctaLabel: string | null; ctaUrlKey: string | null;
};
export type LeadCampaignPreview = {
  ok?: boolean; error?: string; filters?: LeadCampaignFilters; channel?: LeadCampaignChannel;
  recipients?: LeadCampaignRecipient[]; matchingCount?: number; missingContactCount?: number;
};
export type LeadCampaignSendResult = { ok?: boolean; error?: string; sentCount?: number; failedCount?: number };

function field(data: FormData, key: string) {
  const raw = data.get(key);
  if (raw !== null && typeof raw !== "string") throw new Error(`Invalid ${key} filter.`);
  const value = (raw || "").trim();
  if (value.length > 300) throw new Error(`Invalid ${key} filter.`);
  return value;
}
function choice<T extends string>(value: string, allowed: readonly T[], label: string): T | "" {
  if (!value) return "";
  const normalised = value.toUpperCase();
  if (!allowed.includes(normalised as T)) throw new Error(`Please choose a valid ${label}.`);
  return normalised as T;
}
/** Invalid filters fail closed rather than silently expanding a campaign. */
export function parseLeadCampaignFilters(data: FormData): LeadCampaignFilters {
  return {
    type: choice(field(data, "type"), LEAD_TYPES, "lead type"),
    status: choice(field(data, "status"), LEAD_STATUSES, "lead status"),
    excludeType: choice(field(data, "excludeType"), LEAD_TYPES, "excluded type"),
    excludeStatus: choice(field(data, "excludeStatus"), LEAD_STATUSES, "excluded status"),
    area: field(data, "area"), night: choice(field(data, "night"), LEAD_NIGHTS, "preferred night"),
    league: field(data, "league"),
  };
}
export function parseLeadCampaignChannel(data: FormData): LeadCampaignChannel {
  const channel = field(data, "channel");
  if (channel !== "EMAIL" && channel !== "SMS") throw new Error("Please choose Email or SMS.");
  return channel;
}
/** Mirrors Leads' exact include/exclude, area, night and prospective-league semantics. */
export function buildLeadFilterWhere(filters: LeadCampaignFilters): Prisma.InterestLeadWhereInput {
  return {
    ...(filters.type ? { interestType: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.excludeType || filters.excludeStatus ? { NOT: [
      ...(filters.excludeType ? [{ interestType: filters.excludeType }] : []),
      ...(filters.excludeStatus ? [{ status: filters.excludeStatus }] : []),
    ] } : {}),
    ...(filters.area ? { area: filters.area } : {}),
    ...(filters.night ? { preferredNights: { some: { night: filters.night } } } : {}),
    ...(filters.league === "unassigned" ? { leagueId: null } : filters.league ? { leagueId: filters.league } : {}),
  };
}
/** The existing Leads sending guard excludes expansion-partner enquiries too. */
export function buildLeadCampaignWhere(filters: LeadCampaignFilters, includedIds?: string[]): Prisma.InterestLeadWhereInput {
  return { AND: [
    buildLeadFilterWhere(filters),
    { OR: [{ source: null }, { source: { not: EXPANSION_LEAD_SOURCE } }] },
    ...(includedIds !== undefined ? [{ id: { in: includedIds } }] : []),
  ] };
}
export function leadCampaignHref(filters: LeadCampaignFilters) {
  const params = new URLSearchParams();
  for (const key of LEAD_FILTER_KEYS) if (filters[key]) params.set(key, filters[key]);
  return `/admin/leads${params.size ? `?${params}` : ""}`;
}
export function leadCampaignConfirmation(count: number, channel: LeadCampaignChannel) {
  return `SEND ${count} ${channel === "EMAIL" ? "EMAILS" : "TEXTS"}`;
}
/** Explicit identities are always retained when handing off to existing senders. */
export function prepareLeadCampaignSend(data: FormData, filters: LeadCampaignFilters, ids: string[]) {
  if (!ids.length) throw new Error("Select at least one lead before sending.");
  const safe = new FormData();
  for (const key of ["subject", "body", "targetTeamId", "bulkSendConfirmation"]) safe.set(key, String(data.get(key) ?? ""));
  const mapping = { type: "selectedType", status: "selectedStatus", area: "selectedArea", night: "selectedNight", league: "selectedLeague", excludeType: "excludedType", excludeStatus: "excludedStatus" } as const;
  for (const key of LEAD_FILTER_KEYS) safe.set(mapping[key], filters[key]);
  for (const id of ids) safe.append("includedLeadIds", id);
  return safe;
}
