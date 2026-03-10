// ========================================
// File: src/app/register-interest/actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import {
  InterestType,
  LeagueType,
  LeadStatus,
  PreferredNight,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

function isInterestType(value: string): value is InterestType {
  return value === "TEAM" || value === "PLAYER" || value === "REFEREE";
}

function isLeagueType(value: string): value is LeagueType {
  return value === "MENS" || value === "WOMENS" || value === "YOUTH";
}

function isPreferredNight(value: string): value is PreferredNight {
  return (
    value === "MONDAY" ||
    value === "TUESDAY" ||
    value === "WEDNESDAY" ||
    value === "THURSDAY" ||
    value === "FRIDAY" ||
    value === "SATURDAY" ||
    value === "SUNDAY" ||
    value === "ANY"
  );
}

export async function submitRegisterInterest(formData: FormData) {
  const interestTypeRaw = String(formData.get("interestType") ?? "")
    .trim()
    .toUpperCase();

  const contactName = String(formData.get("contactName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const teamName = String(formData.get("teamName") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const leagueTypeRaw = String(formData.get("leagueType") ?? "")
    .trim()
    .toUpperCase();
  const preferredNightRaw = String(formData.get("preferredNight") ?? "")
    .trim()
    .toUpperCase();
  const experienceLevel = String(formData.get("experienceLevel") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const interestType = isInterestType(interestTypeRaw)
    ? interestTypeRaw
    : "TEAM";

  const requiresLeagueType =
    interestType === "TEAM" || interestType === "PLAYER";

  if (!contactName || !email || !area) {
    redirect(`/register-interest?type=${interestType.toLowerCase()}&error=missing`);
  }

  if (requiresLeagueType && !isLeagueType(leagueTypeRaw)) {
    redirect(`/register-interest?type=${interestType.toLowerCase()}&error=missing`);
  }

  const combinedMessage = [
    experienceLevel ? `Experience: ${experienceLevel}` : "",
    message,
  ]
    .filter(Boolean)
    .join("\n\n");

  await prisma.interestLead.create({
    data: {
      interestType,
      status: LeadStatus.NEW,
      contactName,
      email,
      phone: phone || null,
      teamName: interestType === "TEAM" ? teamName || null : null,
      area,
      leagueType: requiresLeagueType ? (leagueTypeRaw as LeagueType) : null,
      preferredNight: isPreferredNight(preferredNightRaw)
        ? (preferredNightRaw as PreferredNight)
        : null,
      message: combinedMessage || null,
    },
  });

  redirect(`/register-interest?type=${interestType.toLowerCase()}&success=1`);
}