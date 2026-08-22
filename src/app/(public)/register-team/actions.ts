// ========================================
// File: src/app/register-team/actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { InterestType, LeagueType } from "@prisma/client";
import { queueLeadWelcomeNotifications } from "@/lib/notifications/transactional";
import {
  buildTeamEmailConflictPath,
  findTeamEmailRegistrationConflict,
} from "@/lib/leads/team-email-registration-guard";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function mapLeagueType(value: string): LeagueType | null {
  switch (value.toUpperCase()) {
    case "MENS":
      return LeagueType.MENS;
    case "WOMENS":
      return LeagueType.WOMENS;
    case "YOUTH":
      return LeagueType.YOUTH;
    default:
      return null;
  }
}

export async function submitTeamLeadAction(formData: FormData) {
  const teamName = clean(formData.get("teamName"));
  const leagueTypeRaw = clean(formData.get("leagueType"));
  const city = clean(formData.get("city"));
  const captainName = clean(formData.get("captainName"));
  const email = clean(formData.get("email")).toLowerCase();
  const phone = clean(formData.get("phone"));
  const squadSize = clean(formData.get("squadSize"));

  if (!teamName) redirect("/register-team?error=team-name");
  if (!leagueTypeRaw) redirect("/register-team?error=league-type");
  if (!city) redirect("/register-team?error=city");
  if (!captainName) redirect("/register-team?error=captain-name");
  if (!email) redirect("/register-team?error=email");

  const leagueType = mapLeagueType(leagueTypeRaw);
  if (!leagueType) redirect("/register-team?error=league-type");

  const registrationConflict = await findTeamEmailRegistrationConflict({
    email,
    teamName,
  });

  if (registrationConflict) {
    redirect(buildTeamEmailConflictPath(registrationConflict));
  }

  const messageParts = [
    `Submitted from the SIXFL register-team page.`,
    squadSize ? `Approx squad size: ${squadSize}` : null,
  ].filter(Boolean);

  const createdLead = await prisma.interestLead.create({
    data: {
      interestType: InterestType.TEAM,
      status: "NEW",
      contactName: captainName,
      email,
      phone: phone || null,
      teamName,
      area: city,
      leagueType,
      message: messageParts.join("\n"),
      source: "website-register-team",
      marketingConsent: false,
      wantsFreeKit: false,
    },
    select: {
      id: true,
      contactName: true,
      email: true,
      phone: true,
      interestType: true,
      area: true,
      teamName: true,
      marketingConsent: true,
    },
  });

  try {
    await queueLeadWelcomeNotifications({
      lead: createdLead,
      signupUrl: "https://www.sixfl.co.uk/register-interest",
    });
  } catch (error) {
    console.error("Register team welcome queue failed:", error);
  }

  redirect("/register-team/success");
}
