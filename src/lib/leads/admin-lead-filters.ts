import {
  InterestType,
  LeadStatus,
  PreferredNight,
  Prisma,
} from "@prisma/client";

export type AdminLeadFilterParams = {
  type?: string;
  status?: string;
  area?: string;
  night?: string;
};

export type ResolvedAdminLeadFilters = {
  selectedType?: InterestType;
  selectedStatus?: LeadStatus;
  selectedArea?: string;
  selectedNight?: PreferredNight;
};

const CALLABLE_STATUSES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.QUALIFIED,
];

function isInterestType(value?: string): value is InterestType {
  return value === "TEAM" || value === "PLAYER" || value === "REFEREE";
}

function isLeadStatus(value?: string): value is LeadStatus {
  return (
    value === "NEW" ||
    value === "CONTACTED" ||
    value === "QUALIFIED" ||
    value === "CLOSED"
  );
}

function isPreferredNight(value?: string): value is PreferredNight {
  return (
    value === "MONDAY" ||
    value === "TUESDAY" ||
    value === "WEDNESDAY" ||
    value === "THURSDAY" ||
    value === "FRIDAY" ||
    value === "SATURDAY" ||
    value === "SUNDAY" ||
    value === "ANY"
  );
}

export function resolveAdminLeadFilters(
  params: AdminLeadFilterParams,
): ResolvedAdminLeadFilters {
  return {
    selectedType: isInterestType(params.type) ? params.type : undefined,
    selectedStatus: isLeadStatus(params.status) ? params.status : undefined,
    selectedArea: params.area?.trim() || undefined,
    selectedNight: isPreferredNight(params.night) ? params.night : undefined,
  };
}

export function buildAdminLeadWhere(
  filters: ResolvedAdminLeadFilters,
): Prisma.InterestLeadWhereInput {
  return {
    ...(filters.selectedType ? { interestType: filters.selectedType } : {}),
    ...(filters.selectedStatus ? { status: filters.selectedStatus } : {}),
    ...(filters.selectedArea ? { area: filters.selectedArea } : {}),
    ...(filters.selectedNight
      ? { preferredNights: { some: { night: filters.selectedNight } } }
      : {}),
  };
}

export function buildCallableLeadWhere(
  filters: ResolvedAdminLeadFilters,
): Prisma.InterestLeadWhereInput {
  return {
    AND: [
      buildAdminLeadWhere(filters),
      { status: { in: CALLABLE_STATUSES } },
      { phoneNormalized: { not: null } },
      { phoneNormalized: { not: "" } },
    ],
  };
}

export function buildAdminLeadFilterQuery(
  filters: ResolvedAdminLeadFilters,
): string {
  const search = new URLSearchParams();
  if (filters.selectedType) search.set("type", filters.selectedType);
  if (filters.selectedStatus) search.set("status", filters.selectedStatus);
  if (filters.selectedArea) search.set("area", filters.selectedArea);
  if (filters.selectedNight) search.set("night", filters.selectedNight);
  return search.toString();
}

export function describeAdminLeadFilters(
  filters: ResolvedAdminLeadFilters,
): string {
  const parts = [
    filters.selectedType ? filters.selectedType.toLowerCase() : null,
    filters.selectedStatus ? filters.selectedStatus.toLowerCase() : null,
    filters.selectedArea ? filters.selectedArea : null,
    filters.selectedNight ? filters.selectedNight.toLowerCase() : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length ? parts.join(" · ") : "all leads";
}
