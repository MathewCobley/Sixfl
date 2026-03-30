// ========================================
// File: src/app/admin/leads/import/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { InterestType, LeadStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export type ImportLeadsState = {
  success: boolean;
  message: string;
  created: number;
  skipped: number;
  errors: string[];
};

const INITIAL_STATE: ImportLeadsState = {
  success: false,
  message: "",
  created: 0,
  skipped: 0,
  errors: [],
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
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

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);

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

function buildContactName(row: Record<string, string>) {
  const explicitContactName = getFirstNonEmpty(row, ["contactName", "name", "fullName"]);
  if (explicitContactName) return explicitContactName;

  const firstName = getFirstNonEmpty(row, ["firstName", "firstname", "first"]);
  const lastName = getFirstNonEmpty(row, ["lastName", "lastname", "surname", "last"]);

  const combined = `${firstName} ${lastName}`.trim();
  if (combined) return combined;

  const email = getFirstNonEmpty(row, ["email"]);
  if (!email) return "";

  return email.split("@")[0];
}

function toInterestType(value: FormDataEntryValue | null): InterestType {
  const raw = String(value ?? "TEAM").toUpperCase();

  if (raw === "PLAYER") return InterestType.PLAYER;
  if (raw === "REFEREE") return InterestType.REFEREE;
  return InterestType.TEAM;
}

function isTruthy(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function importLeadsAction(
  _prevState: ImportLeadsState,
  formData: FormData
): Promise<ImportLeadsState> {
  await requireAdmin();

  const file = formData.get("file");
  const defaultInterestType = toInterestType(formData.get("defaultInterestType"));
  const defaultSource = String(formData.get("defaultSource") ?? "Legacy import").trim() || "Legacy import";
  const skipExisting = isTruthy(formData.get("skipExisting"));

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
    const email = normalizeEmail(getFirstNonEmpty(row, ["email"]));
    const contactName = buildContactName(row);
    const teamName = getFirstNonEmpty(row, ["teamName", "teamname", "team"]);
    const phone = getFirstNonEmpty(row, ["phone", "mobile", "telephone"]);
    const area = getFirstNonEmpty(row, ["area", "location"]);
    const source = getFirstNonEmpty(row, ["source"]) || defaultSource;

    return {
      rowNumber: index + 2,
      email,
      contactName,
      teamName,
      phone,
      area,
      source,
    };
  });

  const errors: string[] = [];
  const seenInCsv = new Set<string>();

  const validRows = parsedRows.filter((row) => {
    if (!row.email) {
      errors.push(`Row ${row.rowNumber}: missing email.`);
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      errors.push(`Row ${row.rowNumber}: invalid email "${row.email}".`);
      return false;
    }

    if (!row.contactName) {
      errors.push(`Row ${row.rowNumber}: missing contact name.`);
      return false;
    }

    if (seenInCsv.has(row.email)) {
      errors.push(`Row ${row.rowNumber}: duplicate email "${row.email}" within CSV.`);
      return false;
    }

    seenInCsv.add(row.email);
    return true;
  });

  if (validRows.length === 0) {
    return {
      success: false,
      message: "No valid rows were found to import.",
      created: 0,
      skipped: 0,
      errors,
    };
  }

  const existingLeads = await prisma.interestLead.findMany({
    where: {
      email: {
        in: validRows.map((row) => row.email),
        mode: "insensitive",
      },
    },
    select: {
      email: true,
    },
  });

  const existingEmailSet = new Set(existingLeads.map((lead) => lead.email.trim().toLowerCase()));

  const rowsToCreate = validRows.filter((row) => {
    if (skipExisting && existingEmailSet.has(row.email)) {
      return false;
    }
    return true;
  });

  const skipped = validRows.length - rowsToCreate.length;

  if (rowsToCreate.length === 0) {
    return {
      success: false,
      message: "All valid rows were skipped because they already exist.",
      created: 0,
      skipped,
      errors,
    };
  }

  const createData: Prisma.InterestLeadCreateManyInput[] = rowsToCreate.map((row) => ({
    interestType: defaultInterestType,
    status: LeadStatus.NEW,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone || null,
    teamName: row.teamName || null,
    area: row.area || null,
    source: row.source || defaultSource,
  }));

  const result = await prisma.interestLead.createMany({
    data: createData,
  });

  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads/import");

  return {
    success: true,
    message: `Import complete. Created ${result.count} lead${result.count === 1 ? "" : "s"}.`,
    created: result.count,
    skipped,
    errors,
  };
}