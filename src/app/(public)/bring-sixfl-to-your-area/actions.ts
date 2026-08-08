// ========================================
// File: src/app/(public)/bring-sixfl-to-your-area/actions.ts
// ========================================

"use server";

import {
  InterestType,
  LeadStatus,
  LeagueType,
  PreferredNight,
} from "@prisma/client";
import { redirect } from "next/navigation";

import {
  EXPANSION_LEAD_PUBLIC_PATH,
  EXPANSION_LEAD_SOURCE,
} from "@/lib/expansion-leads";
import { prisma } from "@/lib/prisma";

function clean(value: FormDataEntryValue | null, maxLength = 2_000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function mapLeagueType(value: string): LeagueType | null {
  if (!value) return null;
  if (value === LeagueType.MENS) return LeagueType.MENS;
  if (value === LeagueType.WOMENS) return LeagueType.WOMENS;
  if (value === LeagueType.YOUTH) return LeagueType.YOUTH;
  return null;
}

function isPreferredNight(value: string): value is PreferredNight {
  return (
    value === PreferredNight.MONDAY ||
    value === PreferredNight.TUESDAY ||
    value === PreferredNight.WEDNESDAY ||
    value === PreferredNight.THURSDAY ||
    value === PreferredNight.FRIDAY ||
    value === PreferredNight.SATURDAY ||
    value === PreferredNight.SUNDAY ||
    value === PreferredNight.ANY
  );
}

function readBoolean(formData: FormData, name: string) {
  return clean(formData.get(name), 10) === "true";
}

function redirectWithError(error: string) {
  redirect(`${EXPANSION_LEAD_PUBLIC_PATH}?error=${error}#apply`);
}

export async function submitExpansionLeadAction(formData: FormData) {
  const honeypot = clean(formData.get("company"), 200);
  if (honeypot) {
    redirect(`${EXPANSION_LEAD_PUBLIC_PATH}/success`);
  }

  const area = clean(formData.get("area"), 120);
  const postcode = clean(formData.get("postcode"), 20).toUpperCase();
  const leagueTypeRaw = clean(formData.get("leagueType"), 20);
  const venueName = clean(formData.get("venueName"), 180);
  const venueDetails = clean(formData.get("venueDetails"), 2_000);
  const estimatedTeams = clean(formData.get("estimatedTeams"), 40);
  const teamConnections = clean(formData.get("teamConnections"), 2_000);
  const experience = clean(formData.get("experience"), 2_000);
  const contactName = clean(formData.get("contactName"), 120);
  const email = clean(formData.get("email"), 254).toLowerCase();
  const phone = clean(formData.get("phone"), 50);
  const additionalNotes = clean(formData.get("additionalNotes"), 2_000);

  const canIntroduceVenue = readBoolean(formData, "canIntroduceVenue");
  const canHelpRecruit = readBoolean(formData, "canHelpRecruit");
  const wantsOngoingRole = readBoolean(formData, "wantsOngoingRole");
  const termsAccepted = readBoolean(formData, "termsAccepted");

  if (!area) redirectWithError("area");
  if (!contactName) redirectWithError("name");
  if (!email) redirectWithError("email");
  if (!isValidEmail(email)) redirectWithError("email-format");
  if (!termsAccepted) redirectWithError("terms");

  const leagueType = mapLeagueType(leagueTypeRaw);
  if (leagueTypeRaw && !leagueType) redirectWithError("league-type");

  const preferredNights = Array.from(
    new Set(
      formData
        .getAll("preferredNights")
        .map((value) => clean(value, 20))
        .filter(isPreferredNight),
    ),
  );

  if (!preferredNights.length || preferredNights.includes(PreferredNight.ANY)) {
    preferredNights.splice(0, preferredNights.length, PreferredNight.ANY);
  }

  const duplicateWindowStart = new Date(Date.now() - 10 * 60 * 1_000);
  const recentDuplicate = await prisma.interestLead.findFirst({
    where: {
      source: EXPANSION_LEAD_SOURCE,
      email,
      area,
      createdAt: { gte: duplicateWindowStart },
    },
    select: { id: true },
  });

  if (recentDuplicate) {
    redirect(`${EXPANSION_LEAD_PUBLIC_PATH}/success`);
  }

  const messageLines = [
    "Submitted from the Bring SIXFL to your area page.",
    postcode ? `Postcode: ${postcode}` : "Postcode: Not supplied",
    venueName
      ? `Potential venue: ${venueName}`
      : "Potential venue: Not yet identified",
    venueDetails ? `Venue / pitch details: ${venueDetails}` : null,
    estimatedTeams
      ? `Estimated interested teams: ${estimatedTeams}`
      : "Estimated interested teams: Not supplied",
    teamConnections
      ? `Existing team connections: ${teamConnections}`
      : "Existing team connections: Not supplied",
    `Can introduce SIXFL to a venue: ${canIntroduceVenue ? "Yes" : "No"}`,
    `Can help recruit opening teams: ${canHelpRecruit ? "Yes" : "No"}`,
    `Interested in an ongoing local role: ${wantsOngoingRole ? "Yes" : "No"}`,
    experience ? `Relevant experience: ${experience}` : null,
    additionalNotes ? `Additional notes: ${additionalNotes}` : null,
    "Commission terms acknowledgement: Accepted. The submission does not reserve an area or create a right to commission; terms must be agreed in writing before work begins.",
  ].filter((line): line is string => Boolean(line));

  await prisma.interestLead.create({
    data: {
      interestType: InterestType.TEAM,
      status: LeadStatus.NEW,
      contactName,
      email,
      phone: phone || null,
      teamName: `Expansion opportunity: ${area}`,
      area,
      leagueType,
      message: messageLines.join("\n\n"),
      source: EXPANSION_LEAD_SOURCE,
      marketingConsent: false,
      wantsFreeKit: false,
      preferredNights: {
        create: preferredNights.map((night) => ({ night })),
      },
    },
  });

  redirect(`${EXPANSION_LEAD_PUBLIC_PATH}/success`);
}
