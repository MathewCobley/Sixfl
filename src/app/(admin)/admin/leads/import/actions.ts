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

function isPlausibleContactName(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (isValidEmail(trimmed)) return false;
  if (normalizeUkMobileNumber(cleanPhone(trimmed))) return false;
  if (/^l:/i.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return false;
  if (!/[a-z]/i.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 6;
}

function inferContactNameFromUnlabelledMetaColumns(row: Record<string, string>) {
  const entries = Object.entries(row);
  const emailIndex = entries.findIndex(([, value]) => isValidEmail(value.trim()));
  if (emailIndex < 0) return "";

  const phoneIndex = entries.findIndex(([, value]) =>
    Boolean(normalizeUkMobileNumber(cleanPhone(value))),
  );

  // Meta's current export places email, full name and phone next to each other,
  // but may leave all three headings blank. Prefer the value between email and
  // phone, then the value immediately after email.
  if (phoneIndex > emailIndex + 1) {
    for (let index = emailIndex + 1; index < phoneIndex; index += 1) {
      const [key, value] = entries[index];
      if (/^column\d+$/.test(key) && isPlausibleContactName(value)) {
        return value.trim();
      }
    }
  }

  const nextEntry = entries[emailIndex + 1];
  if (
    nextEntry &&
    /^column\d+$/.test(nextEntry[0]) &&
    isPlausibleContactName(nextEntry[1])
  ) {
    return nextEntry[1].trim();
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

  const inferredMetaName = inferContactNameFromUnlabelledMetaColumns(row);
  if (inferredMetaName) return inferredMetaName;

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
  const namedPhone = cleanPhone(
    getFirstNonEmpty(row, ["phone", "phoneNumber", "phone_number", "mobile", "telephone"]),
  );
  if (namedPhone) return namedPhone;

  // Current Meta exports can leave the phone heading blank. In that case,
  // identify the phone by the value itself rather than relying on a header.
  for (const value of Object.values(row)) {
    const candidate = cleanPhone(value);
    if (candidate && normalizeUkMobileNumber(candidate)) {
      return candidate;
    }
  }

  return "";
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
  const campaignName = getFirstNonEmpty(row, ["campaignName", "campaign_name"]);
  const formName = getFirstNonEmpty(row, ["formName", "form_name"]);
  const adName = getFirstNonEmpty(row, ["adName", "ad_name"]);
  const adSetName = getFirstNonEmpty(row, ["adsetName", "adset_name"]);

  for (const candidate of [adName, adSetName, campaignName, formName]) {
    if (!candidate) continue;

    const parts = candidate
      .split(/\s+[–—-]\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2 && /^heartlands$/i.test(parts[0])) {
      return parts[1];
    }

    const firstPart = (parts[0] ?? candidate)
      .replace(/\s+team$/i, "")
      .replace(/\s+(lead|leads|campaign|form)$/i, "")
      .trim();

    if (
      firstPart &&
      firstPart.length <= 50 &&
      !/^(sixfl|meta|facebook|instagram|team|football)$/i.test(firstPart)
    ) {
      return firstPart;
    }
  }

  return "";
}

function inferMetaLeagueSlug(row: Record<string, string>) {
  if (!isMetaRow(row)) return "";

  const campaignName = getFirstNonEmpty(row, ["campaignName", "campaign_name"]);
  const formName = getFirstNonEmpty(row, ["formName", "form_name"]);
  const adName = getFirstNonEmpty(row, ["adName", "ad_name"]);
  const adSetName = getFirstNonEmpty(row, ["adsetName", "adset_name"]);
  const haystack = [campaignName, formName, adName, adSetName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("heartlands")) return "heartlands";

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

  const inferredLeagueSlugs = Array.from(
    new Set(rows.map(inferMetaLeagueSlug).filter(Boolean)),
  );
  const inferredAreas = Array.from(
    new Set(rows.map(inferMetaArea).filter(Boolean)),
  );

  const [inferredLeagues, currentCompetitions] = await Promise.all([
    inferredLeagueSlugs.length
      ? prisma.league.findMany({
          where: {
            slug: { in: inferredLeagueSlugs },
            isActive: true,
          },
          select: { id: true, slug: true },
        })
      : Promise.resolve([]),
    inferredAreas.length
      ? prisma.leagueCompetition.findMany({
          where: {
            isActive: true,
            area: { in: inferredAreas, mode: "insensitive" },
            currentLeagueId: { not: null },
          },
          select: {
            area: true,
            currentLeague: {
              select: { id: true, isActive: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const inferredLeagueIdBySlug = new Map(
    inferredLeagues.map((league) => [league.slug, league.id]),
  );

  const currentLeagueIdByArea = new Map<string, string>();
  for (const competition of currentCompetitions) {
    const area = competition.area?.trim().toLowerCase();
    const leagueId = competition.currentLeague?.isActive
      ? competition.currentLeague.id
      : null;
    if (!area || !leagueId) continue;

    const existing = currentLeagueIdByArea.get(area);
    if (!existing) {
      currentLeagueIdByArea.set(area, leagueId);
    } else if (existing !== leagueId) {
      // Ambiguous areas must remain unset rather than guessing.
      currentLeagueIdByArea.delete(area);
    }
  }

  const parsedRows = rows.map((row, index) => {
    const email = findEmail(row);
    const contactName = buildContactName(row);
    const teamName = getFirstNonEmpty(row, ["teamName", "teamname", "team"]);
    const phone = findPhone(row);
    const phoneNormalized = normalizeUkMobileNumber(phone);
    const area = areaOverride || getFirstNonEmpty(row, ["area", "location"]) || inferMetaArea(row);
    const source = buildSource(row, sourceOverride);
    const inferredLeagueSlug = inferMetaLeagueSlug(row);
    const leagueId =
      (inferredLeagueSlug
        ? inferredLeagueIdBySlug.get(inferredLeagueSlug) ?? null
        : null) ??
      (area ? currentLeagueIdByArea.get(area.trim().toLowerCase()) ?? null : null);

    return {
      rowNumber: index + 2,
      email,
      contactName,
      teamName,
      phone,
      phoneNormalized,
      area,
      source,
      leagueId,
      interestType: inferInterestType(row, defaultInterestType),
      message: buildMetaMessage(row),
      createdAt: parseCreatedAt(row),
    };
  });

  const errors: string[] = [];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  const validRows = parsedRows.filter((row) => {
    if (row.email && !isValidEmail(row.email)) {
      errors.push(`Row ${row.rowNumber}: invalid email "${row.email}".`);
      return false;
    }

    if (!row.contactName) {
      errors.push(`Row ${row.rowNumber}: missing contact name.`);
      return false;
    }

    if (!row.email && !row.phoneNormalized) {
      if (row.phone) {
        errors.push(
          `Row ${row.rowNumber}: no usable contact details. Phone "${row.phone}" is not a valid UK mobile number and no email was supplied.`,
        );
      } else {
        errors.push(
          `Row ${row.rowNumber}: missing contact details. An email address or UK mobile number is required.`,
        );
      }
      return false;
    }

    if (row.phone && !row.phoneNormalized && row.email) {
      errors.push(
        `Row ${row.rowNumber}: ignored invalid/non-UK phone "${row.phone}" and imported using the email address.`,
      );
    }

    if (row.email && seenEmails.has(row.email)) {
      errors.push(`Row ${row.rowNumber}: duplicate email "${row.email}" within CSV.`);
      return false;
    }

    if (row.phoneNormalized && seenPhones.has(row.phoneNormalized)) {
      errors.push(`Row ${row.rowNumber}: duplicate phone "${row.phone}" within CSV.`);
      return false;
    }

    if (row.email) seenEmails.add(row.email);
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

  const emails = validRows.flatMap((row) => (row.email ? [row.email] : []));
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
          area: true,
          leagueId: true,
        },
      })
    : [];

  const duplicateMatches = validRows.flatMap((row) => {
    const emailMatch = row.email
      ? existingLeads.find(
          (lead) => lead.email && normalizeEmail(lead.email) === row.email,
        )
      : undefined;
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

  // Re-uploading a current Meta export should repair earlier imports that were
  // created from the old blank-heading assumptions, without creating duplicates.
  for (const row of validRows) {
    if (!duplicateRowNumbers.has(row.rowNumber)) continue;

    const matchedLead =
      (row.email
        ? existingLeads.find(
            (lead) => lead.email && normalizeEmail(lead.email) === row.email,
          )
        : undefined) ??
      (row.phoneNormalized
        ? existingLeads.find((lead) => lead.phoneNormalized === row.phoneNormalized)
        : undefined);

    if (!matchedLead) continue;

    const emailPrefix = row.email ? row.email.split("@")[0] : "";
    const shouldRepairName =
      Boolean(row.contactName) &&
      row.contactName.trim().toLowerCase() !== emailPrefix.toLowerCase() &&
      matchedLead.contactName.trim().toLowerCase() === emailPrefix.toLowerCase();

    const data: Prisma.InterestLeadUpdateInput = {};
    if (shouldRepairName) data.contactName = row.contactName;
    if (!matchedLead.phoneNormalized && row.phoneNormalized) {
      data.phone = row.phone;
      data.phoneNormalized = row.phoneNormalized;
    }
    if (!matchedLead.area && row.area) data.area = row.area;
    if (!matchedLead.leagueId && row.leagueId) {
      data.league = { connect: { id: row.leagueId } };
    }

    if (Object.keys(data).length > 0) {
      await prisma.interestLead.update({
        where: { id: matchedLead.id },
        data,
      });
    }
  }

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
    email: row.email || null,
    phone: row.phoneNormalized ? row.phone : null,
    phoneNormalized: row.phoneNormalized,
    teamName: row.teamName || null,
    area: row.area || null,
    leagueId: row.leagueId,
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
