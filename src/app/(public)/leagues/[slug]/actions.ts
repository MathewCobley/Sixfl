// ========================================
// File: src/app/leagues/[slug]/actions.ts
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

export async function createLeagueInterestLeadAction(formData: FormData) {
  const contactName = String(formData.get("contactName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const teamName = String(formData.get("teamName") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const interestType =
    String(formData.get("interestType") ?? "TEAM").trim().toUpperCase() === "PLAYER"
      ? InterestType.PLAYER
      : InterestType.TEAM;

  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();

  if (!contactName) {
    throw new Error("Contact name is required.");
  }

  if (!email) {
    throw new Error("Email is required.");
  }

  if (!leagueId) {
    throw new Error("League is required.");
  }

  if (interestType === InterestType.TEAM) {
    const registrationConflict = await findTeamEmailRegistrationConflict({
      email,
      teamName,
    });

    if (registrationConflict) {
      redirect(buildTeamEmailConflictPath(registrationConflict));
    }
  }

  const leagueForLead = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      area: true,
      dayOfWeek: true,
      leagueType: true,
    },
  });

  if (!leagueForLead) {
    throw new Error("League is required.");
  }

  const lead = await prisma.interestLead.create({
    data: {
      interestType,
      status: "NEW",
      contactName,
      email,
      phone: phone || null,
      teamName: teamName || null,
      area: leagueForLead.area || area || null,
      leagueType: leagueForLead.leagueType ?? LeagueType.MENS,
      message: message || null,
      source: source || "league-page",
      leagueId: leagueForLead.id,
      preferredNights: leagueForLead.dayOfWeek
        ? {
            create: [
              {
                night: leagueForLead.dayOfWeek,
              },
            ],
          }
        : undefined,
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
      lead,
      signupUrl: "https://www.sixfl.co.uk/register-interest",
    });
  } catch (error) {
    console.error("League lead welcome queue failed:", error);
  }

  redirect(`/leagues/thanks?lead=${lead.id}`);
}
