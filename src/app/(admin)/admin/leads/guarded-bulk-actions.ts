// ========================================
// File: src/app/(admin)/admin/leads/guarded-bulk-actions.ts
// ========================================

"use server";

import {
  InterestType,
  LeadStatus,
  PreferredNight,
  type Prisma,
} from "@prisma/client";

import { TEAM_PLACE_CONFIRMATION_CTA_KEY } from "@/lib/leads/teamPlaceConfirmation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  sendBulkLeadEmailAction as rawSendBulkLeadEmailAction,
  sendBulkLeadSmsAction as rawSendBulkLeadSmsAction,
} from "./actions";
import { sendBulkTeamPlaceConfirmationEmailAction } from "./team-confirmation-bulk-action";

const BULK_CONFIRMATION_LIMIT = 20;

type BulkEmailActionState = {
  ok?: boolean;
  error?: string;
  sentCount?: number;
  failedCount?: number;
};

type BulkSmsActionState = {
  ok?: boolean;
  error?: string;
  sentCount?: number;
  failedCount?: number;
};

function isLeadStatus(value: string): value is LeadStatus {
  return (
    value === "NEW" ||
    value === "CONTACTED" ||
    value === "QUALIFIED" ||
    value === "CLOSED"
  );
}

function isInterestType(value: string): value is InterestType {
  return value === "TEAM" || value === "PLAYER" || value === "REFEREE";
}

function isPreferredNight(value: string): value is PreferredNight {
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

function getIncludedLeadIds(formData: FormData) {
  return formData
    .getAll("includedLeadIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function getLeadFilterWhere(formData: FormData, contactField: "email" | "phone") {
  const selectedTypeRaw = String(formData.get("selectedType") ?? "")
    .trim()
    .toUpperCase();
  const selectedStatusRaw = String(formData.get("selectedStatus") ?? "")
    .trim()
    .toUpperCase();
  const selectedArea = String(formData.get("selectedArea") ?? "").trim();
  const selectedNightRaw = String(formData.get("selectedNight") ?? "")
    .trim()
    .toUpperCase();
  const includedLeadIds = getIncludedLeadIds(formData);

  const where: Prisma.InterestLeadWhereInput = {
    ...(selectedTypeRaw && isInterestType(selectedTypeRaw)
      ? { interestType: selectedTypeRaw }
      : {}),
    ...(selectedStatusRaw && isLeadStatus(selectedStatusRaw)
      ? { status: selectedStatusRaw }
      : {}),
    ...(selectedArea ? { area: selectedArea } : {}),
    ...(selectedNightRaw && isPreferredNight(selectedNightRaw)
      ? {
          preferredNights: {
            some: {
              night: selectedNightRaw,
            },
          },
        }
      : {}),
    AND: [
      {
        [contactField]: {
          not: null,
        },
      },
      {
        [contactField]: {
          not: "",
        },
      },
    ],
    ...(includedLeadIds.length > 0
      ? {
          id: {
            in: includedLeadIds,
          },
        }
      : {}),
  };

  return where;
}

function getTeamConfirmationLeadWhere(formData: FormData) {
  return {
    ...getLeadFilterWhere(formData, "email"),
    interestType: InterestType.TEAM,
    leagueId: {
      not: null,
    },
  } satisfies Prisma.InterestLeadWhereInput;
}

function getConfirmationText(formData: FormData) {
  return String(formData.get("bulkSendConfirmation") ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function requiredConfirmationPhrase(count: number, label: "EMAILS" | "TEXTS") {
  return `SEND ${count} ${label}`;
}

function validateBulkConfirmation(input: {
  count: number;
  label: "EMAILS" | "TEXTS";
  formData: FormData;
}) {
  if (input.count <= BULK_CONFIRMATION_LIMIT) {
    return null;
  }

  const requiredPhrase = requiredConfirmationPhrase(input.count, input.label);
  const providedPhrase = getConfirmationText(input.formData);

  if (providedPhrase === requiredPhrase) {
    return null;
  }

  return `This bulk action would queue ${input.count} ${input.label.toLowerCase()}. Type ${requiredPhrase} to confirm.`;
}

export async function sendBulkLeadEmailAction(
  prevState: BulkEmailActionState,
  formData: FormData,
): Promise<BulkEmailActionState> {
  await requireAdmin();

  const ctaUrlKey = String(formData.get("ctaUrlKey") ?? "").trim();
  const isTeamConfirmationEmail = ctaUrlKey === TEAM_PLACE_CONFIRMATION_CTA_KEY;

  const recipientCount = await prisma.interestLead.count({
    where: isTeamConfirmationEmail
      ? getTeamConfirmationLeadWhere(formData)
      : getLeadFilterWhere(formData, "email"),
  });

  const confirmationError = validateBulkConfirmation({
    count: recipientCount,
    label: "EMAILS",
    formData,
  });

  if (confirmationError) {
    return {
      ok: false,
      error: confirmationError,
    };
  }

  if (isTeamConfirmationEmail) {
    return sendBulkTeamPlaceConfirmationEmailAction(prevState, formData);
  }

  return rawSendBulkLeadEmailAction(prevState, formData);
}

export async function sendBulkLeadSmsAction(
  prevState: BulkSmsActionState,
  formData: FormData,
): Promise<BulkSmsActionState> {
  await requireAdmin();

  const recipientCount = await prisma.interestLead.count({
    where: getLeadFilterWhere(formData, "phone"),
  });

  const confirmationError = validateBulkConfirmation({
    count: recipientCount,
    label: "TEXTS",
    formData,
  });

  if (confirmationError) {
    return {
      ok: false,
      error: confirmationError,
    };
  }

  return rawSendBulkLeadSmsAction(prevState, formData);
}
