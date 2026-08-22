// ========================================
// File: src/app/(public)/leagues/heartlands/actions.ts
// ========================================

"use server";

import { InterestType, LeagueType } from "@prisma/client";
import { redirect } from "next/navigation";

import {
  buildTeamEmailConflictPath,
  findTeamEmailRegistrationConflict,
} from "@/lib/leads/team-email-registration-guard";
import { prisma } from "@/lib/prisma";
import { queueLeadWelcomeNotifications } from "@/lib/notifications/transactional";

export async function createHeartlandsInterestLeadAction(formData: FormData) {
  const contactName = String(formData.get("contactName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const teamName = String(formData.get("teamName") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const requestedType = String(formData.get("interestType") ?? "TEAM")
    .trim()
    .toUpperCase();
  const interestType =
    requestedType === InterestType.PLAYER
      ? InterestType.PLAYER
      : InterestType.TEAM;

  if (!contactName) throw new Error("Contact name is required.");
  if (!email) throw new Error("Email is required.");
  if (!leagueId) throw new Error("League is required.");

  if (interestType === InterestType.TEAM) {
    const registrationConflict = await findTeamEmailRegistrationConflict({
      email,
      teamName,
    });

    if (registrationConflict) {
      redirect(buildTeamEmailConflictPath(registrationConflict));
    }
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      area: true,
      dayOfWeek: true,
      leagueType: true,
    },
  });

  if (!league) throw new Error("League is required.");

  const lead = await prisma.interestLead.create({
    data: {
      interestType,
      status: "NEW",
      contactName,
      email,
      phone: phone || null,
      teamName: interestType === InterestType.TEAM ? teamName || null : null,
      area: league.area || area || null,
      leagueType: league.leagueType ?? LeagueType.MENS,
      message: message || null,
      source: source || "heartlands-launch-page",
      leagueId: league.id,
      preferredNights: league.dayOfWeek
        ? {
            create: [
              {
                night: league.dayOfWeek,
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
      signupUrl: "https://www.sixfl.co.uk/leagues/heartlands",
    });
  } catch (error) {
    console.error("Heartlands welcome queue failed:", error);
  }

  redirect(`/leagues/thanks?lead=${lead.id}`);
}
