// ========================================
// File: src/app/(admin)/admin/leagues/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  LeagueType,
  NotificationAudience,
  NotificationChannel,
  PreferredNight,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { getEmailReplyDomain } from "@/lib/resend/client";

export type LeagueFormState = {
  success?: boolean;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
};

type ParsedLeagueInput = {
  name: string;
  slug: string;
  season: string | null;
  isActive: boolean;
  isMoving?: boolean;
  area: string | null;
  dayOfWeek: PreferredNight | null;
  leagueType: LeagueType | null;
  venueName: string | null;
  kickoffInfo: string | null;
  format: string | null;
  surface: string | null;
  description: string | null;
  heroImageUrl: string | null;
  badgeUrl: string | null;
  ctaText: string | null;
};

type LeagueConfirmationDetailsInput = {
  proposedStartDate: Date | null;
  minutesPerGame: number | null;
  costPerTeamPerMatchPence: number | null;
  targetTeamCount: number | null;
};

type LeagueBookingDetailsInput = {
  bookedPitchCount: number | null;
  bookingStartTime: string | null;
  bookingEndTime: string | null;
  pitchCostPerHourOverridePence: number | null;
};

const DAY_OPTIONS = new Set<PreferredNight>([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
  "ANY",
]);

const LEAGUE_TYPE_OPTIONS = new Set<LeagueType>([
  "MENS",
  "WOMENS",
  "YOUTH",
]);

function normaliseText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseBoolean(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "on" || text === "1";
}

function isValidImagePath(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function parseOptionalWholeNumber(input: {
  value: FormDataEntryValue | null;
  min: number;
  max: number;
}) {
  const raw = String(input.value ?? "").trim();

  if (!raw) return undefined;

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < input.min || parsed > input.max) {
    return null;
  }

  return parsed;
}

function parseRequiredRefereesPerNight(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();

  if (!raw) return 1;

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 20) {
    return null;
  }

  return parsed;
}

function parseProposedStartDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();

  if (!raw) return undefined;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }

  const parsed = new Date(`${raw}T12:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function parseCostPerTeamPerMatchPence(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();

  if (!raw) return undefined;

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
    return null;
  }

  return Math.round(parsed * 100);
}

function parseOptionalMoneyPence(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) return null;

  return Math.round(parsed * 100);
}

function parseOptionalTime(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  if (!/^\d{2}:\d{2}$/.test(raw)) return null;
  return raw;
}

async function setLeagueRequiredRefereesPerNight(input: {
  leagueId: string;
  requiredRefereesPerNight: number;
}) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "League"
    SET
      "requiredRefereesPerNight" = ${input.requiredRefereesPerNight},
      "updatedAt" = NOW()
    WHERE id = ${input.leagueId}
  `);
}

async function setLeagueConfirmationDetails(input: {
  leagueId: string;
  details: LeagueConfirmationDetailsInput;
}) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "League"
    SET
      "proposedStartDate" = ${input.details.proposedStartDate},
      "minutesPerGame" = ${input.details.minutesPerGame},
      "costPerTeamPerMatchPence" = ${input.details.costPerTeamPerMatchPence},
      "targetTeamCount" = ${input.details.targetTeamCount},
      "updatedAt" = NOW()
    WHERE id = ${input.leagueId}
  `);
}

async function setLeagueBookingDetails(input: {
  leagueId: string;
  details: LeagueBookingDetailsInput;
}) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "League"
    SET
      "bookedPitchCount" = ${input.details.bookedPitchCount},
      "bookingStartTime" = ${input.details.bookingStartTime},
      "bookingEndTime" = ${input.details.bookingEndTime},
      "pitchCostPerHourOverridePence" = ${input.details.pitchCostPerHourOverridePence},
      "updatedAt" = NOW()
    WHERE id = ${input.leagueId}
  `);
}

function redirectIfEmailRepliesNotConfigured(path: string) {
  try {
    getEmailReplyDomain();
  } catch {
    redirect(path);
  }
}

function parseLeagueInput(formData: FormData): {
  data: ParsedLeagueInput;
  requiredRefereesPerNight: number;
  confirmationDetails: LeagueConfirmationDetailsInput;
  bookingDetails: LeagueBookingDetailsInput;
  errors: Record<string, string[]>;
} {
  const errors: Record<string, string[]> = {};

  const name = String(formData.get("name") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const slug = slugify(rawSlug || name);

  const season = normaliseText(formData.get("season"));
  const area = normaliseText(formData.get("area"));
  const venueName = normaliseText(formData.get("venueName"));
  const kickoffInfo = normaliseText(formData.get("kickoffInfo"));
  const format = normaliseText(formData.get("format"));
  const surface = normaliseText(formData.get("surface"));
  const description = normaliseText(formData.get("description"));
  const heroImageUrl = normaliseText(formData.get("heroImageUrl"));
  const badgeUrl = normaliseText(formData.get("badgeUrl"));
  const ctaText = normaliseText(formData.get("ctaText"));

  const proposedStartDate = parseProposedStartDate(formData.get("proposedStartDate"));
  const minutesPerGame = parseOptionalWholeNumber({ value: formData.get("minutesPerGame"), min: 1, max: 180 });
  const costPerTeamPerMatchPence = parseCostPerTeamPerMatchPence(formData.get("costPerTeamPerMatch"));
  const targetTeamCount = parseOptionalWholeNumber({ value: formData.get("targetTeamCount"), min: 2, max: 64 });
  const bookedPitchCount = parseOptionalWholeNumber({ value: formData.get("bookedPitchCount"), min: 0, max: 50 });
  const bookingStartTime = parseOptionalTime(formData.get("bookingStartTime"));
  const bookingEndTime = parseOptionalTime(formData.get("bookingEndTime"));
  const pitchCostPerHourOverridePence = parseOptionalMoneyPence(formData.get("pitchCostPerHourOverride"));

  const isActive = parseBoolean(formData.get("isActive"));
  // Older open forms must not silently clear this new setting.
  const isMoving = formData.get("leagueMoveSettingPresent") === "1"
    ? parseBoolean(formData.get("isMoving")) : undefined;
  const requiredRefereesPerNight = parseRequiredRefereesPerNight(formData.get("requiredRefereesPerNight"));

  const rawDayOfWeek = String(formData.get("dayOfWeek") ?? "").trim();
  const rawLeagueType = String(formData.get("leagueType") ?? "").trim();

  const dayOfWeek = rawDayOfWeek ? DAY_OPTIONS.has(rawDayOfWeek as PreferredNight) ? (rawDayOfWeek as PreferredNight) : null : null;
  const leagueType = rawLeagueType ? LEAGUE_TYPE_OPTIONS.has(rawLeagueType as LeagueType) ? (rawLeagueType as LeagueType) : null : null;

  if (!name) errors.name = ["League name is required."];
  if (!slug) errors.slug = ["Slug is required."];
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.slug = ["Slug must contain only lowercase letters, numbers, and hyphens."];
  if (rawDayOfWeek && !dayOfWeek) errors.dayOfWeek = ["Please choose a valid day."];
  if (rawLeagueType && !leagueType) errors.leagueType = ["Please choose a valid league type."];
  if (proposedStartDate === null) errors.proposedStartDate = ["Please enter a valid proposed start date."];
  if (minutesPerGame === null) errors.minutesPerGame = ["Minutes per game must be a whole number between 1 and 180."];
  if (costPerTeamPerMatchPence === null) errors.costPerTeamPerMatch = ["Cost must be a valid amount between £0 and £1,000."];
  if (targetTeamCount === null) errors.targetTeamCount = ["Target number of teams must be a whole number between 2 and 64."];
  if (requiredRefereesPerNight === null) errors.requiredRefereesPerNight = ["Referees needed per night must be a whole number between 0 and 20."];
  if (bookedPitchCount === null) errors.bookedPitchCount = ["Pitches booked must be a whole number between 0 and 50."];
  if (bookingStartTime === null) errors.bookingStartTime = ["Booking start must be a valid time."];
  if (bookingEndTime === null) errors.bookingEndTime = ["Booking end must be a valid time."];
  if (pitchCostPerHourOverridePence === null) errors.pitchCostPerHourOverride = ["Hourly cost override must be a valid amount."];
  if (heroImageUrl && !isValidImagePath(heroImageUrl)) errors.heroImageUrl = ["Hero image must be a full URL or a site-relative path starting with /." ];
  if (badgeUrl && !isValidImagePath(badgeUrl)) errors.badgeUrl = ["League badge must be a full URL or a site-relative path starting with /." ];
  if (ctaText && ctaText.length > 80) errors.ctaText = ["CTA text must be 80 characters or fewer."];

  return {
    data: { name, slug, season, isActive, isMoving, area, dayOfWeek, leagueType, venueName, kickoffInfo, format, surface, description, heroImageUrl, badgeUrl, ctaText },
    requiredRefereesPerNight: requiredRefereesPerNight ?? 1,
    confirmationDetails: { proposedStartDate: proposedStartDate ?? null, minutesPerGame: minutesPerGame ?? null, costPerTeamPerMatchPence: costPerTeamPerMatchPence ?? null, targetTeamCount: targetTeamCount ?? null },
    bookingDetails: { bookedPitchCount: bookedPitchCount ?? null, bookingStartTime: bookingStartTime ?? null, bookingEndTime: bookingEndTime ?? null, pitchCostPerHourOverridePence: pitchCostPerHourOverridePence ?? null },
    errors,
  };
}

export async function createLeagueAction(_prevState: LeagueFormState, formData: FormData): Promise<LeagueFormState> {
  await requireAdmin();
  const { data, requiredRefereesPerNight, confirmationDetails, bookingDetails, errors } = parseLeagueInput(formData);
  if (Object.keys(errors).length > 0) return { error: "Please fix the highlighted fields.", errors };
  const existingSlug = await prisma.league.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (existingSlug) return { error: "That slug is already in use.", errors: { slug: ["That slug is already in use."] } };
  const existingNameSeason = await prisma.league.findFirst({ where: { name: data.name, season: data.season }, select: { id: true } });
  if (existingNameSeason) return { error: "A league with that name and season already exists.", errors: { name: ["A league with that name and season already exists."] } };
  const league = await prisma.league.create({ data, select: { id: true, slug: true } });
  await setLeagueRequiredRefereesPerNight({ leagueId: league.id, requiredRefereesPerNight });
  await setLeagueConfirmationDetails({ leagueId: league.id, details: confirmationDetails });
  await setLeagueBookingDetails({ leagueId: league.id, details: bookingDetails });
  revalidatePath("/admin/leagues"); revalidatePath("/admin/referee-availability"); revalidatePath("/admin/night-board"); revalidatePath("/"); revalidatePath("/leagues"); revalidatePath(`/leagues/${league.slug}`);
  redirect(`/admin/leagues/${league.id}?created=1`);
}

export async function updateLeagueAction(leagueId: string, _prevState: LeagueFormState, formData: FormData): Promise<LeagueFormState> {
  await requireAdmin();
  const existingLeague = await prisma.league.findUnique({ where: { id: leagueId }, select: { id: true, slug: true } });
  if (!existingLeague) return { error: "League not found." };
  const { data, requiredRefereesPerNight, confirmationDetails, bookingDetails, errors } = parseLeagueInput(formData);
  if (Object.keys(errors).length > 0) return { error: "Please fix the highlighted fields.", errors };
  const existingSlug = await prisma.league.findFirst({ where: { slug: data.slug, NOT: { id: leagueId } }, select: { id: true } });
  if (existingSlug) return { error: "That slug is already in use.", errors: { slug: ["That slug is already in use."] } };
  const existingNameSeason = await prisma.league.findFirst({ where: { name: data.name, season: data.season, NOT: { id: leagueId } }, select: { id: true } });
  if (existingNameSeason) return { error: "A league with that name and season already exists.", errors: { name: ["A league with that name and season already exists."] } };
  await prisma.league.update({ where: { id: leagueId }, data });
  await setLeagueRequiredRefereesPerNight({ leagueId, requiredRefereesPerNight });
  await setLeagueConfirmationDetails({ leagueId, details: confirmationDetails });
  await setLeagueBookingDetails({ leagueId, details: bookingDetails });
  revalidatePath("/admin/leagues"); revalidatePath(`/admin/leagues/${leagueId}`); revalidatePath("/admin/referee-availability"); revalidatePath("/admin/night-board"); revalidatePath("/"); revalidatePath("/leagues"); revalidatePath(`/leagues/${data.slug}`);
  revalidatePath("/admin/teams");
  revalidatePath("/admin/teams/[id]", "page");
  if (existingLeague.slug !== data.slug) revalidatePath(`/leagues/${existingLeague.slug}`);
  return { success: true, message: "League updated successfully." };
}

export async function sendLeagueTeamsMessageAction(formData: FormData) {
  const { user } = await requireAdmin();
  const adminUserId = user?.id ?? null;
  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const channel = String(formData.get("channel") ?? "EMAIL").trim().toUpperCase() === "SMS" ? NotificationChannel.SMS : NotificationChannel.EMAIL;
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!leagueId) redirect("/admin/leagues");
  if (!body) redirect(`/admin/leagues/${leagueId}?messageError=missing_body`);
  if (channel === NotificationChannel.EMAIL && !subject) redirect(`/admin/leagues/${leagueId}?messageError=missing_subject`);
  if (channel === NotificationChannel.EMAIL) redirectIfEmailRepliesNotConfigured(`/admin/leagues/${leagueId}?messageError=reply_not_configured`);
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { id: true, name: true, season: true, teams: { select: { id: true, name: true, logoUrl: true }, orderBy: { name: "asc" } } } });
  if (!league) redirect("/admin/leagues");
  let queued = 0;
  for (const team of league.teams) {
    const { recipient, snapshot } = await upsertTeamNotificationRecipient(team.id);
    const dispatch = await queueDirectNotification({ recipientId: recipient.id, audience: NotificationAudience.TEAM, channel, subject: channel === NotificationChannel.EMAIL ? subject : null, body, sourceType: "LEAGUE_TEAM_MESSAGE", sourceId: `${league.id}:${team.id}:${Date.now()}`, metadata: { leagueId: league.id, leagueName: league.name, teamId: team.id, teamName: team.name, sentFromAdmin: adminUserId }, variables: { firstName: snapshot?.primaryContact.name ?? team.name, teamName: team.name, leagueName: league.name }, emailBranding: { teamName: team.name, teamLogoUrl: team.logoUrl, leagueName: league.season ? `${league.name} — ${league.season}` : league.name }, createdByUserId: adminUserId });
    if (dispatch.status === "QUEUED") queued += 1;
  }
  revalidatePath("/admin/messaging");
  revalidatePath(`/admin/leagues/${leagueId}`);
  redirect(`/admin/leagues/${leagueId}?messageSent=${queued}`);
}
