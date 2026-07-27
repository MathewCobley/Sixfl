// ========================================
// File: src/app/(public)/player-pool/actions.ts
// ========================================

"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  PLAYER_POOL_PROFILE_STATUSES,
  cleanPlayerPoolText,
  createPlayerPoolId,
  createPlayerPoolPublicCode,
  createPlayerPoolToken,
  ensurePlayerPoolTables,
  normalizePlayerPoolEmail,
  splitPlayerPoolName,
} from "@/lib/player-pool/storage";

type ProfileLookupRow = {
  id: string;
  prospectId: string;
  profileToken: string;
  publicCode: string;
  leadId: string | null;
};

const ALLOWED_AGE_BANDS = ["16–17", "18–20", "21–24", "25–29", "30–39", "40+"];
const ALLOWED_POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward", "Happy to play anywhere"];
const ALLOWED_PREFERRED_POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward", "No strong preference"];
const ALLOWED_EXPERIENCE = [
  "New to organised football or returning after a break",
  "Mainly casual or social football",
  "Regular small-sided football player",
  "Regular 11-a-side club player",
  "Experienced competitive player",
];
const ALLOWED_AVAILABILITY = [
  "Every week",
  "Most weeks",
  "Two or three times a month",
  "Occasionally or as a backup",
];
const ALLOWED_NIGHTS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "ANY"];

function valueFromAllowed(value: FormDataEntryValue | null, allowed: string[]) {
  const parsed = String(value ?? "").trim();
  return allowed.includes(parsed) ? parsed : "";
}

function valuesFromAllowed(values: FormDataEntryValue[], allowed: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter((value) => allowed.includes(value)),
    ),
  );
}

function buildFormPath(token: string, error: string) {
  const base = token ? `/player-pool/profile/${encodeURIComponent(token)}` : "/player-pool";
  return `${base}?error=${encodeURIComponent(error)}`;
}

async function findProfile(input: { token: string; emailNormalized: string }) {
  if (input.token) {
    const byToken = await prisma.$queryRaw<ProfileLookupRow[]>`
      SELECT "id", "prospectId", "profileToken", "publicCode", "leadId"
      FROM "PlayerPoolProfile"
      WHERE "profileToken" = ${input.token}
      LIMIT 1
    `;
    if (byToken[0]) return byToken[0];
  }

  const byEmail = await prisma.$queryRaw<ProfileLookupRow[]>`
    SELECT "id", "prospectId", "profileToken", "publicCode", "leadId"
    FROM "PlayerPoolProfile"
    WHERE "emailNormalized" = ${input.emailNormalized}
    LIMIT 1
  `;

  return byEmail[0] ?? null;
}

export async function submitPlayerPoolProfileAction(formData: FormData) {
  await ensurePlayerPoolTables();

  const token = String(formData.get("profileToken") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = normalizePlayerPoolEmail(formData.get("email"));
  const phone = cleanPlayerPoolText(formData.get("phone"));
  const ageBand = valueFromAllowed(formData.get("ageBand"), ALLOWED_AGE_BANDS);
  const positions = valuesFromAllowed(formData.getAll("positions"), ALLOWED_POSITIONS);
  const preferredPosition = valueFromAllowed(
    formData.get("preferredPosition"),
    ALLOWED_PREFERRED_POSITIONS,
  );
  const experienceSummary = valueFromAllowed(
    formData.get("experienceSummary"),
    ALLOWED_EXPERIENCE,
  );
  const availabilityLevel = valueFromAllowed(
    formData.get("availabilityLevel"),
    ALLOWED_AVAILABILITY,
  );
  const preferredNights = valuesFromAllowed(
    formData.getAll("preferredNights"),
    ALLOWED_NIGHTS,
  );
  const area = String(formData.get("area") ?? "").trim();
  const availabilitySummary = cleanPlayerPoolText(formData.get("availabilitySummary"));
  const leagueId = cleanPlayerPoolText(formData.get("leagueId"));
  const consentShareProfile = formData.get("consentShareProfile") === "on";
  const consentContact = formData.get("consentContact") === "on";

  if (!fullName || !email || !ageBand || positions.length === 0) {
    redirect(buildFormPath(token, "Please complete your name, email, age group and positions."));
  }
  if (!preferredPosition || !experienceSummary || !availabilityLevel) {
    redirect(buildFormPath(token, "Please complete your preferred position, experience and availability."));
  }
  if (preferredNights.length === 0 || !area) {
    redirect(buildFormPath(token, "Please choose at least one evening and enter the area you can play in."));
  }
  if (!consentShareProfile || !consentContact) {
    redirect(buildFormPath(token, "Both permission boxes are required to join SIXFL PlayerPool."));
  }

  const existingProfile = await findProfile({ token, emailNormalized: email });
  const { firstName, lastName } = splitPlayerPoolName(fullName);

  let prospectId: string | null = existingProfile?.prospectId ?? null;

  if (!prospectId) {
    const existingProspect = await prisma.teamPlayerProspect.findFirst({
      where: {
        teamId: null,
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true },
    });
    prospectId = existingProspect?.id ?? null;
  }

  if (prospectId) {
    await prisma.teamPlayerProspect.update({
      where: { id: prospectId },
      data: {
        teamId: null,
        firstName,
        lastName,
        email,
        phone,
        ageBand,
        preferredPositions: positions.join(", "),
        experienceSummary,
        availabilityLevel,
        preferredNights: preferredNights as Prisma.InputJsonValue,
        availabilitySummary,
        source: "SIXFL PlayerPool",
        status: PLAYER_POOL_PROFILE_STATUSES.AVAILABLE,
      },
    });
  } else {
    const created = await prisma.teamPlayerProspect.create({
      data: {
        teamId: null,
        firstName,
        lastName,
        email,
        phone,
        ageBand,
        preferredPositions: positions.join(", "),
        experienceSummary,
        availabilityLevel,
        preferredNights: preferredNights as Prisma.InputJsonValue,
        availabilitySummary,
        source: "SIXFL PlayerPool",
        status: PLAYER_POOL_PROFILE_STATUSES.AVAILABLE,
      },
      select: { id: true },
    });
    prospectId = created.id;
  }

  const profileId = existingProfile?.id ?? createPlayerPoolId();
  const profileToken = existingProfile?.profileToken ?? createPlayerPoolToken();
  const publicCode = existingProfile?.publicCode ?? createPlayerPoolPublicCode();

  await prisma.$executeRaw`
    INSERT INTO "PlayerPoolProfile" (
      "id", "prospectId", "leadId", "profileToken", "publicCode",
      "emailNormalized", "area", "leagueId", "preferredPosition",
      "consentShareProfile", "consentContact", "status",
      "profileSubmittedAt", "createdAt", "updatedAt"
    ) VALUES (
      ${profileId}, ${prospectId}, ${existingProfile?.leadId ?? null}, ${profileToken}, ${publicCode},
      ${email}, ${area}, ${leagueId}, ${preferredPosition},
      ${consentShareProfile}, ${consentContact}, ${PLAYER_POOL_PROFILE_STATUSES.AVAILABLE},
      NOW(), NOW(), NOW()
    )
    ON CONFLICT ("prospectId") DO UPDATE SET
      "emailNormalized" = EXCLUDED."emailNormalized",
      "area" = EXCLUDED."area",
      "leagueId" = EXCLUDED."leagueId",
      "preferredPosition" = EXCLUDED."preferredPosition",
      "consentShareProfile" = EXCLUDED."consentShareProfile",
      "consentContact" = EXCLUDED."consentContact",
      "status" = EXCLUDED."status",
      "profileSubmittedAt" = NOW(),
      "updatedAt" = NOW()
  `;

  redirect(`/player-pool/thanks?code=${encodeURIComponent(publicCode)}`);
}
