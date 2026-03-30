// ========================================
// File: src/app/leagues/[slug]/actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { InterestType, LeagueType, PreferredNight } from "@prisma/client";

export async function createLeagueInterestLeadAction(formData: FormData) {
  const contactName = String(formData.get("contactName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const teamName = String(formData.get("teamName") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

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

  const lead = await prisma.interestLead.create({
    data: {
      interestType: InterestType.TEAM,
      status: "NEW",
      contactName,
      email,
      phone: phone || null,
      teamName: teamName || null,
      area: area || null,
      leagueType: LeagueType.MENS,
      message: message || null,
      source: source || "league-page",
      leagueId,
      preferredNights: {
        create: [
          {
            night: PreferredNight.TUESDAY,
          },
        ],
      },
    },
    select: {
      id: true,
    },
  });

  redirect(`/leagues/thanks?lead=${lead.id}`);
}