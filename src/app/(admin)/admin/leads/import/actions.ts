// ========================================
// File: src/app/(admin)/admin/leads/import/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { InterestType, LeadStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeUkMobileNumber } from "@/lib/phone/normalize";

export type ImportLeadsState = {
  success: boolean;
  message: string;
  processed: number;
  created: number;
  skipped: number;
  skippedDetails: string[];
  errors: string[];
};

const INITIAL_STATE: ImportLeadsState = {
  success: false,
  message: "",
  processed: 0,
  created: 0,
  skipped: 0,
  skippedDetails: [],
  errors: [],
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function compactHeader(value: string) {
  return normalizeHeader(value).replace(/[^a-z0-9]/g, "");
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());

  return result.map((value) => value.replace(/^"(.*)"$/, "$1").trim());
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  // Meta currently exports the email column with a blank heading. Give every
  // blank heading a stable synthetic key so its value is not lost.
  const headers = parseCsvLine(lines[0]).map((header, index) => {
    const normalized = normalizeHeader(header);
    return normalized || `column${index + 1}`;
  });

  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() ?? "";
    });

    return row;
  });

  return { headers, rows };
}

function getFirstNonEmpty(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getFirstByHeaderContains(row: Record<string, string>, needles: string[]) {
  const compactNeedles = needles.map(compactHeader);

  for (const [key, value] of Object.entries(row)) {
    if (!value?.trim()) continue;
    const compactKey = compactHeader(key);
    if (compactNeedles.some((needle) => compactKey.includes(needle))) {
      return value.trim();
    }
  }

  return "";
}

function buildContactName(row: Record<string, string>) {
  const explicitContactName = getFirstNonEmpty(row, ["contactName", "name", "fullName", "full_name"]);
  if (explicitContactName) return explicitContactName;

  const firstName = getFirstNonEmpty(row, ["firstName", "firstname", "first"]);
  const lastName = getFirstNonEmpty(row, ["lastName", "lastname", "surname", "last"]);

  const combined = `${firstName} ${lastName}`.trim();
  if (combined) return combined;

  const email = findEmail(row);
  if (!email) return "";

  return email.split("@")[0];
}

function toInterestType(value: FormDataEntryValue | null): InterestType {
  const raw = String(value ?? "TEAM").toUpperCase();

  if (raw === "PLAYER") return InterestType.PLAYER;
  if (raw === "REFEREE") return InterestType.REFEREE;
  return InterestType.TEAM;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function findEmail(row: Record<string, string>) {
  const namedEmail = getFirstNonEmpty(row, ["email", "emailAddress", "email_address"]);
  if (namedEmail) return normalizeEmail(namedEmail);

  // Meta's lead export can contain the email value under a blank column heading.
  const inferredEmail = Object.values(row).find((value) => isValidEmail(value.trim()));
  return inferredEmail ? normalizeEmail(inferredEmail) : "";
}

function cleanPhone(value: string) {
  return value.trim().replace(/^p:\s*/i, "");
}

function findPhone(row: Record<string, string>) {
  return cleanPhone(
    getFirstNonEmpty(row, ["phone", "phoneNumber", "phone_number", "mobile", "telephone"]),
  );
}

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function humanizeAnswer(value: string) {
  const text = value.trim().replace(/_/g, " ").replace(/\s+/g, " ");
  if (!text) return "";

  const withContractions = text.replace(/^i[’']?m\b/i, "I'm");
  return withContractions.charAt(0).toUpperCase() + withContractions.slice(1);
}

function inferInterestType(row: Record<string, string>, fallback: InterestType) {
  const answer = getFirstByHeaderContains(row, ["what are you looking for"]);
  if (!answer) return fallback;

  const normalized = normalizeAnswer(answer);

  if (normalized.includes("individual") && normalized.includes("team")) {
    return InterestType.PLAYER;
  }

  if (normalized.includes("player") && normalized.includes("looking")) {
    return InterestType.PLAYER;
  }

  if (normalized.includes("team")) {
    return InterestType.TEAM;
  }

  if (normalized.includes("referee")) {
    return InterestType.REFEREE;
  }

  return fallback;
}

function isMetaRow(row: Record<string, string>) {
  const leadId = getFirstNonEmpty(row, ["id"]);
  const platform = getFirstNonEmpty(row, ["platform"]);
  const adName = getFirstNonEmpty(row, ["adName", "ad_name"]);
  const campaignName = getFirstNonEmpty(row, ["campaignName", "campaign_name"]);

  return leadId.startsWith("l:") || Boolean(platform && (adName || campaignName));
}

function platformLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "fb" || normalized === "facebook") return "Facebook";
  if (normalized === "ig" || normalized === "instagram") return "Instagram";
  return value.trim() || "Meta";
}

function inferMetaArea(row: Record<string, string>) {
  const adName = getFirstNonEmpty(row, ["adName", "ad_name"]);
  const adSetName = getFirstNonEmpty(row, ["adsetName", "adset_name"]);

  for (const candidate of [adName, adSetName]) {
    if (!candidate) continue;
    const parts = candidate
      .split(/\s+[–—-]\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2 && /^heartlands$/i.test(parts[0])) {
      return parts[1];
    }
  }

  return "";
}

function parseCreatedAt(row: Record<string, string>) {
  const raw = getFirstNonEmpty(row, ["createdTime", "created_time"]);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildMetaMessage(row: Record<string, string>) {
  if (!isMetaRow(row)) return "";

  const leadId = getFirstNonEmpty(row, ["id"]);
  const platform = getFirstNonEmpty(row, ["platform"]);
  const campaignName = getFirstNonEmpty(row, ["campaignName", "campaign_name"]);
  const adName = getFirstNonEmpty(row, ["adName", "ad_name"]);
  const intent = getFirstByHeaderContains(row, ["what are you looking for"]);
  const startTiming = getFirstByHeaderContains(row, ["when would you like to start playing"]);

  return [
    intent ? `Interest: ${humanizeAnswer(intent)}` : "",
    startTiming ? `Start: ${humanizeAnswer(startTiming)}` : "",
    leadId ? `Meta lead ID: ${leadId}` : "",
    platform ? `Platform: ${platformLabel(platform)}` : "",
    campaignName ? `Campaign: ${campaignName}` : "",
    adName ? `Ad: ${adName}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function buildSource(row: Record<string, string>, sourceOverride: string) {
  const explicitSource = getFirstNonEmpty(row, ["source"]);
  if (explicitSource) return explicitSource;
  if (sourceOverride) return sourceOverride;

  if (isMetaRow(row)) {
    const platform = getFirstNonEmpty(row, ["platform"]);
    return `Meta - ${platformLabel(platform)}`;
  }

  return "Legacy import";
}

export async function importLeadsAction(
  _prevState: ImportLeadsState,
  formData: FormData,
): Promise<ImportLeadsState> {
  await requireAdmin();

  const file = formData.get("file");
  const defaultInterestType = toInterestType(formData.get("defaultInterestType"));
  const sourceOverride = String(formData.get("defaultSource") ?? "").trim();
  const areaOverride = String(formData.get("defaultArea") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return {
      ...INITIAL_STATE,
      message: "Please choose a CSV file to import.",
    };
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return {
      ...INITIAL_STATE,
      message: "Please upload a valid .csv file.",
    };
  }

  const text = await file.text();
  const { rows } = parseCsv(text);

  if (rows.length === 0) {
    return {
      ...INITIAL_STATE,
      message: "The CSV appears to be empty or could not be parsed.",
    };
  }

  const parsedRows = rows.map((row, index) => {
    const email = findEmail(row);
    const contactName = buildContactName(row);
    const teamName = getFirstNonEmpty(row, ["teamName", "teamname", "team"]);
    const phone = findPhone(row);
    const phoneNormalized = normalizeUkMobileNumber(phone);
    const area = areaOverride || getFirstNonEmpty(row, ["area", "location"]) || inferMetaArea(row);
    const source = buildSource(row, sourceOverride);

    return {
      rowNumber: index + 2,
      email,
      contactName,
      teamName,
      phone,
      phoneNormalized,
      area,
      source,
      interestType: inferInterestType(row, defaultInterestType),
      message: buildMetaMessage(row),
      createdAt: parseCreatedAt(row),
    };
  });

  const errors: string[] = [];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  const validRows = parsedRows.filter((row) => {
    if (!row.email) {
      errors.push(`Row ${row.rowNumber}: missing email.`);
      return false;
    }

    if (!isValidEmail(row.email)) {
      errors.push(`Row ${row.rowNumber}: invalid email "${row.email}".`);
      return false;
    }

    if (!row.contactName) {
      errors.push(`Row ${row.rowNumber}: missing contact name.`);
      return false;
    }

    if (seenEmails.has(row.email)) {
      errors.push(`Row ${row.rowNumber}: duplicate email "${row.email}" within CSV.`);
      return false;
    }

    if (row.phoneNormalized && seenPhones.has(row.phoneNormalized)) {
      errors.push(`Row ${row.rowNumber}: duplicate phone "${row.phone}" within CSV.`);
      return false;
    }

    seenEmails.add(row.email);
    if (row.phoneNormalized) seenPhones.add(row.phoneNormalized);
    return true;
  });

  if (validRows.length === 0) {
    return {
      success: false,
      message: "No valid rows were found to import.",
      processed: rows.length,
      created: 0,
      skipped: rows.length,
      skippedDetails: [],
      errors,
    };
  }

  const emails = validRows.map((row) => row.email);
  const phones = validRows.flatMap((row) => (row.phoneNormalized ? [row.phoneNormalized] : []));
  const duplicateWhere: Prisma.InterestLeadWhereInput[] = [
    ...(emails.length
      ? [
          {
            email: {
              in: emails,
              mode: "insensitive" as const,
            },
          },
        ]
      : []),
    ...(phones.length ? [{ phoneNormalized: { in: phones } }] : []),
  ];

  const existingLeads = duplicateWhere.length
    ? await prisma.interestLead.findMany({
        where: { OR: duplicateWhere },
        select: {
          id: true,
          contactName: true,
          email: true,
          phone: true,
          phoneNormalized: true,
        },
      })
    : [];

  const duplicateMatches = validRows.flatMap((row) => {
    const emailMatch = existingLeads.find(
      (lead) => lead.email && normalizeEmail(lead.email) === row.email,
    );
    const phoneMatch = row.phoneNormalized
      ? existingLeads.find((lead) => lead.phoneNormalized === row.phoneNormalized)
      : undefined;

    if (!emailMatch && !phoneMatch) return [];

    const matchedLead = emailMatch ?? phoneMatch;
    const sameExistingLead = Boolean(
      emailMatch && phoneMatch && emailMatch.id === phoneMatch.id,
    );

    let reason = "matching existing lead";
    if (emailMatch && phoneMatch && sameExistingLead) reason = "same email and phone";
    else if (emailMatch && phoneMatch) reason = "email and phone match existing leads";
    else if (emailMatch) reason = "same email";
    else if (phoneMatch) reason = "same phone";

    const existingName = matchedLead?.contactName?.trim() || "Existing lead";

    return [
      {
        rowNumber: row.rowNumber,
        detail:
          existingName.toLowerCase() === row.contactName.trim().toLowerCase()
            ? `${row.contactName} — skipped (${reason}).`
            : `${row.contactName} — skipped (${reason}; existing lead: ${existingName}).`,
      },
    ];
  });

  const duplicateRowNumbers = new Set(
    duplicateMatches.map((match) => match.rowNumber),
  );

  // Imports are deliberately duplicate-safe. A matching email OR normalized
  // phone is skipped so re-uploading a Meta export cannot create duplicate leads.
  const rowsToCreate = validRows.filter(
    (row) => !duplicateRowNumbers.has(row.rowNumber),
  );

  const skippedDetails = duplicateMatches.map((match) => match.detail);
  const invalidCount = rows.length - validRows.length;
  const existingCount = validRows.length - rowsToCreate.length;
  const skipped = invalidCount + existingCount;

  if (rowsToCreate.length === 0) {
    return {
      success: true,
      message: `Import checked ${rows.length} row${rows.length === 1 ? "" : "s"}. Nothing new was added.`,
      processed: rows.length,
      created: 0,
      skipped,
      skippedDetails,
      errors,
    };
  }

  const createData: Prisma.InterestLeadCreateManyInput[] = rowsToCreate.map((row) => ({
    interestType: row.interestType,
    status: LeadStatus.NEW,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone || null,
    phoneNormalized: row.phoneNormalized,
    teamName: row.teamName || null,
    area: row.area || null,
    message: row.message || null,
    source: row.source,
    ...(row.createdAt ? { createdAt: row.createdAt } : {}),
  }));

  const result = await prisma.interestLead.createMany({
    data: createData,
  });

  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads/import");

  return {
    success: true,
    message: `Import complete. Created ${result.count} lead${result.count === 1 ? "" : "s"} from ${rows.length} row${rows.length === 1 ? "" : "s"}.`,
    processed: rows.length,
    created: result.count,
    skipped,
    skippedDetails,
    errors,
  };
}
