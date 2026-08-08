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

import { EXPANSION_LEAD_SOURCE } from "@/lib/expansion-leads";
import { TEAM_PLACE_CONFIRMATION_CTA_KEY } from "@/lib/leads/teamPlaceConfirmation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  sendBulkLeadEmailAction as rawSendBulkLeadEmailAction,
  sendBulkLeadSmsAction as rawSendBulkLeadSmsAction,
} from "./actions";
import { sendBulkTeamPlaceConfirmationEmailAction } from "./team-confirmation-bulk-action";

const BULK_CONFIRMATION_LIMIT = 20;
const TEAM_PLACE_CONFIRMATION_TEMPLATE_KEY = "team-place-confirmation-email";

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
    OR: [
      { source: null },
      { source: { not: EXPANSION_LEAD_SOURCE } },
    ],
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

function withIncludedLeadIds(formData: FormData, leadIds: string[]) {
  const safeFormData = new FormData();

  formData.forEach((value, key) => {
    if (key !== "includedLeadIds") {
      safeFormData.append(key, value);
    }
  });

  for (const leadId of leadIds) {
    safeFormData.append("includedLeadIds", leadId);
  }

  return safeFormData;
}

async function getMatchingLeadIds(where: Prisma.InterestLeadWhereInput) {
  const leads = await prisma.interestLead.findMany({
    where,
    select: { id: true },
  });

  return leads.map((lead) => lead.id);
}

async function isTeamPlaceConfirmationEmail(formData: FormData) {
  const ctaUrlKey = String(formData.get("ctaUrlKey") ?? "").trim();
  const templateKey = String(formData.get("templateKey") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const ctaLabel = String(formData.get("ctaLabel") ?? "").trim().toLowerCase();
  const body = String(formData.get("body") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const templateText = `${subject}\n${body}`;

  if (
    ctaUrlKey === TEAM_PLACE_CONFIRMATION_CTA_KEY ||
    templateKey === TEAM_PLACE_CONFIRMATION_TEMPLATE_KEY ||
    ctaLabel.includes("confirm our team place") ||
    /\{\{\s*league(Name|DetailsBlock|StartLine)\s*\}\}/i.test(templateText)
  ) {
    return true;
  }

  if (!templateId) {
    return false;
  }

  const template = await prisma.emailTemplate.findUnique({
    where: { id: templateId },
    select: {
      key: true,
      ctaUrlKey: true,
      ctaLabel: true,
      subject: true,
      body: true,
    },
  });

  if (!template) {
    return false;
  }

  return (
    template.key === TEAM_PLACE_CONFIRMATION_TEMPLATE_KEY ||
    template.ctaUrlKey === TEAM_PLACE_CONFIRMATION_CTA_KEY ||
    Boolean(template.ctaLabel?.toLowerCase().includes("confirm our team place")) ||
    /\{\{\s*league(Name|DetailsBlock|StartLine)\s*\}\}/i.test(
      `${template.subject ?? ""}\n${template.body}`,
    )
  );
}

export async function sendBulkLeadEmailAction(
  prevState: BulkEmailActionState,
  formData: FormData,
): Promise<BulkEmailActionState> {
  await requireAdmin();

  const isTeamConfirmationEmail = await isTeamPlaceConfirmationEmail(formData);
  const where = isTeamConfirmationEmail
    ? getTeamConfirmationLeadWhere(formData)
    : getLeadFilterWhere(formData, "email");
  const matchingLeadIds = await getMatchingLeadIds(where);
  const recipientCount = matchingLeadIds.length;

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

  if (recipientCount === 0) {
    return {
      ok: false,
      error: "No matching recipients were found for this bulk email.",
    };
  }

  const safeFormData = withIncludedLeadIds(formData, matchingLeadIds);

  if (isTeamConfirmationEmail) {
    return sendBulkTeamPlaceConfirmationEmailAction(prevState, safeFormData);
  }

  return rawSendBulkLeadEmailAction(prevState, safeFormData);
}

export async function sendBulkLeadSmsAction(
  prevState: BulkSmsActionState,
  formData: FormData,
): Promise<BulkSmsActionState> {
  await requireAdmin();

  const matchingLeadIds = await getMatchingLeadIds(
    getLeadFilterWhere(formData, "phone"),
  );
  const recipientCount = matchingLeadIds.length;

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

  if (recipientCount === 0) {
    return {
      ok: false,
      error: "No matching SMS recipients were found for this message.",
    };
  }

  return rawSendBulkLeadSmsAction(
    prevState,
    withIncludedLeadIds(formData, matchingLeadIds),
  );
}
