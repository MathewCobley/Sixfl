// ========================================
// File: src/app/(public)/player-pool/actions.ts
// ========================================

"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import {
  PLAYER_POOL_LEAGUE_AVAILABILITY,
  isPlayerPoolLeagueAvailability,
  listPlayerPoolLeagueOptions,
  type PlayerPoolLeagueOption,
} from "@/lib/player-pool/leagues";
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
  leagueId: string | null;
  prospectTeamId: string | null;
  prospectStatus: string;
};

type LeaguePreferenceInput = {
  leagueId: string;
  availabilityStatus: string;
  isPrimary: boolean;
};

const ALLOWED_AGE_BANDS = ["16–17", "18–20", "21–24", "25–29", "30–39", "40+"];
const ALLOWED_POSITIONS = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
  "Happy to play anywhere",
];
const ALLOWED_PREFERRED_POSITIONS = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
  "No strong preference",
];
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

function formValues(values: FormDataEntryValue[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function buildFormPath(
  token: string,
  error: string,
  contextLeagueId?: string | null,
) {
  const base = token
    ? `/player-pool/profile/${encodeURIComponent(token)}`
    : "/player-pool";
  const params = new URLSearchParams({ error });
  if (!token && contextLeagueId) params.set("leagueId", contextLeagueId);
  return `${base}?${params.toString()}`;
}

async function findProfile(input: { token: string; emailNormalized: string }) {
  if (input.token) {
    const byToken = await prisma.$queryRaw<ProfileLookupRow[]>`
      SELECT
        profile."id",
        profile."prospectId",
        profile."profileToken",
        profile."publicCode",
        profile."leadId",
        profile."leagueId",
        prospect."teamId" AS "prospectTeamId",
        prospect."status" AS "prospectStatus"
      FROM "PlayerPoolProfile" profile
      JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
      WHERE profile."profileToken" = ${input.token}
      LIMIT 1
    `;
    if (byToken[0]) return byToken[0];
  }

  const byEmail = await prisma.$queryRaw<ProfileLookupRow[]>`
    SELECT
      profile."id",
      profile."prospectId",
      profile."profileToken",
      profile."publicCode",
      profile."leadId",
      profile."leagueId",
      prospect."teamId" AS "prospectTeamId",
      prospect."status" AS "prospectStatus"
    FROM "PlayerPoolProfile" profile
    JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
    WHERE profile."emailNormalized" = ${input.emailNormalized}
    LIMIT 1
  `;

  return byEmail[0] ?? null;
}

function positiveLeagueStatus(value: string) {
  return (
    value === PLAYER_POOL_LEAGUE_AVAILABILITY.MOST_WEEKS ||
    value === PLAYER_POOL_LEAGUE_AVAILABILITY.SOMETIMES
  );
}

function uniqueLeagueNights(leagues: PlayerPoolLeagueOption[]) {
  return Array.from(
    new Set(
      leagues
        .map((league) => league.dayOfWeek)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export async function submitPlayerPoolProfileAction(formData: FormData) {
  await ensurePlayerPoolTables();

  const token = String(formData.get("profileToken") ?? "").trim();
  const contextLeagueId = cleanPlayerPoolText(formData.get("contextLeagueId"));
  const requestedLeagueIds = formValues(formData.getAll("leagueIds"));
  const knownLeagueAvailability = String(
    formData.get("knownLeagueAvailability") ?? "",
  ).trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = normalizePlayerPoolEmail(formData.get("email"));
  const phone = cleanPlayerPoolText(formData.get("phone"));
  const ageBand = valueFromAllowed(formData.get("ageBand"), ALLOWED_AGE_BANDS);
  const positions = valuesFromAllowed(
    formData.getAll("positions"),
    ALLOWED_POSITIONS,
  );
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
  const submittedArea = cleanPlayerPoolText(formData.get("area"));
  const availabilitySummary = cleanPlayerPoolText(
    formData.get("availabilitySummary"),
  );
  const consentShareProfile = formData.get("consentShareProfile") === "on";
  const consentContact = formData.get("consentContact") === "on";

  if (!fullName || !email || !ageBand || positions.length === 0) {
    redirect(
      buildFormPath(
        token,
        "Please complete your name, email, age group and positions.",
        contextLeagueId,
      ),
    );
  }
  if (!preferredPosition || !experienceSummary || !availabilityLevel) {
    redirect(
      buildFormPath(
        token,
        "Please complete your preferred position, experience and availability.",
        contextLeagueId,
      ),
    );
  }
  if (!consentShareProfile || !consentContact) {
    redirect(
      buildFormPath(
        token,
        "Both permission boxes are required to join SIXFL PlayerPool.",
        contextLeagueId,
      ),
    );
  }

  const existingProfile = await findProfile({
    token,
    emailNormalized: email,
  });
  const activeLeagues = await listPlayerPoolLeagueOptions();
  const activeLeagueById = new Map(
    activeLeagues.map((league) => [league.id, league]),
  );

  let contextLeague = contextLeagueId
    ? activeLeagueById.get(contextLeagueId) ?? null
    : null;

  if (
    !contextLeague &&
    contextLeagueId &&
    existingProfile?.leagueId === contextLeagueId
  ) {
    const historical = await listPlayerPoolLeagueOptions({
      includeLeagueIds: [contextLeagueId],
    });
    contextLeague =
      historical.find((league) => league.id === contextLeagueId) ?? null;
  }

  if (contextLeague) {
    if (
      !isPlayerPoolLeagueAvailability(knownLeagueAvailability) ||
      knownLeagueAvailability === PLAYER_POOL_LEAGUE_AVAILABILITY.AVAILABLE
    ) {
      redirect(
        buildFormPath(
          token,
          `Tell us whether you can usually play in ${contextLeague.name}.`,
          contextLeague.id,
        ),
      );
    }
  }

  const selectedLeagueIds = new Set(
    requestedLeagueIds.filter((leagueId) => activeLeagueById.has(leagueId)),
  );

  if (contextLeague) {
    if (positiveLeagueStatus(knownLeagueAvailability)) {
      selectedLeagueIds.add(contextLeague.id);
    } else {
      selectedLeagueIds.delete(contextLeague.id);
    }
  }

  if (selectedLeagueIds.size === 0) {
    redirect(
      buildFormPath(
        token,
        contextLeague &&
          knownLeagueAvailability ===
            PLAYER_POOL_LEAGUE_AVAILABILITY.NOT_AVAILABLE
          ? "Choose at least one other SIXFL league that you could play in."
          : "Choose at least one SIXFL league that you could play in.",
        contextLeague?.id ?? contextLeagueId,
      ),
    );
  }

  const positiveLeagues = Array.from(selectedLeagueIds)
    .map((leagueId) =>
      leagueId === contextLeague?.id
        ? contextLeague
        : activeLeagueById.get(leagueId) ?? null,
    )
    .filter((league): league is PlayerPoolLeagueOption => Boolean(league));
  const primaryLeagueId =
    contextLeague && positiveLeagueStatus(knownLeagueAvailability)
      ? contextLeague.id
      : positiveLeagues[0]?.id ?? null;
  const primaryLeague = primaryLeagueId
    ? positiveLeagues.find((league) => league.id === primaryLeagueId) ?? null
    : null;
  const preferredNights = uniqueLeagueNights(positiveLeagues);
  const area = submittedArea ?? primaryLeague?.area ?? null;

  const leaguePreferences: LeaguePreferenceInput[] = positiveLeagues.map(
    (league) => ({
      leagueId: league.id,
      availabilityStatus:
        league.id === contextLeague?.id
          ? knownLeagueAvailability
          : PLAYER_POOL_LEAGUE_AVAILABILITY.AVAILABLE,
      isPrimary: league.id === primaryLeagueId,
    }),
  );

  if (
    contextLeague &&
    knownLeagueAvailability === PLAYER_POOL_LEAGUE_AVAILABILITY.NOT_AVAILABLE
  ) {
    leaguePreferences.push({
      leagueId: contextLeague.id,
      availabilityStatus: PLAYER_POOL_LEAGUE_AVAILABILITY.NOT_AVAILABLE,
      isPrimary: false,
    });
  }

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

  const profileId = existingProfile?.id ?? createPlayerPoolId();
  const profileToken = existingProfile?.profileToken ?? createPlayerPoolToken();
  const publicCode =
    existingProfile?.publicCode ?? createPlayerPoolPublicCode();

  await prisma.$transaction(async (tx) => {
    if (prospectId) {
      const preserveSquadStatus = Boolean(
        existingProfile?.prospectTeamId ||
          existingProfile?.prospectStatus === "ACTIVE_SQUAD",
      );

      await tx.teamPlayerProspect.update({
        where: { id: prospectId },
        data: {
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
          status: preserveSquadStatus
            ? existingProfile?.prospectStatus
            : PLAYER_POOL_PROFILE_STATUSES.AVAILABLE,
        },
      });
    } else {
      const created = await tx.teamPlayerProspect.create({
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

    await tx.$executeRaw`
      INSERT INTO "PlayerPoolProfile" (
        "id", "prospectId", "leadId", "profileToken", "publicCode",
        "emailNormalized", "area", "leagueId", "preferredPosition",
        "consentShareProfile", "consentContact", "status",
        "profileSubmittedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${profileId}, ${prospectId}, ${existingProfile?.leadId ?? null}, ${profileToken}, ${publicCode},
        ${email}, ${area}, ${primaryLeagueId}, ${preferredPosition},
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

    await tx.$executeRaw`
      DELETE FROM "PlayerPoolLeaguePreference"
      WHERE "profileId" = ${profileId}
    `;

    for (const preference of leaguePreferences) {
      await tx.$executeRaw`
        INSERT INTO "PlayerPoolLeaguePreference" (
          "id", "profileId", "leagueId", "availabilityStatus",
          "isPrimary", "createdAt", "updatedAt"
        ) VALUES (
          ${createPlayerPoolId()}, ${profileId}, ${preference.leagueId},
          ${preference.availabilityStatus}, ${preference.isPrimary}, NOW(), NOW()
        )
      `;
    }
  });

  redirect(`/player-pool/thanks?code=${encodeURIComponent(publicCode)}`);
}
