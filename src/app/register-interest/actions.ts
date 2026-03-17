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
import { sendEmail } from "@/lib/email";

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

function isTruthyCheckbox(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function formatInterestType(value: InterestType) {
  if (value === "TEAM") return "Team";
  if (value === "PLAYER") return "Player";
  return "Referee";
}

function formatLeagueType(value: LeagueType | null) {
  if (!value) return "—";
  if (value === "MENS") return "Men’s";
  if (value === "WOMENS") return "Women’s";
  return "Youth";
}

function formatPreferredNight(value: PreferredNight) {
  if (value === "ANY") return "Any";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatPreferredNights(
  values: Array<{ night: PreferredNight }> | PreferredNight[]
) {
  const nights = values.map((value) =>
    typeof value === "string" ? value : value.night
  );

  if (!nights.length) return "—";

  const uniqueNights = Array.from(new Set(nights));

  if (uniqueNights.includes("ANY")) {
    return "Any";
  }

  return uniqueNights.map(formatPreferredNight).join(", ");
}

function formatYesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function buildConfirmationCopy(interestType: InterestType) {
  if (interestType === "TEAM") {
    return {
      subject: "SIXFL team interest received",
      heading: "Thanks for registering your team.",
      body: "We’ve received your details and we’ll contact you when league spaces open in your area.",
    };
  }

  if (interestType === "PLAYER") {
    return {
      subject: "SIXFL player interest received",
      heading: "You’re on the SIXFL player list.",
      body: "We’ve received your details and we’ll contact you when launch spaces open or teams need players in your area.",
    };
  }

  return {
    subject: "SIXFL referee interest received",
    heading: "Thanks for registering referee interest.",
    body: "We’ve received your details and we’ll contact you as SIXFL launch plans develop in your area.",
  };
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

  const preferredNightValues = formData
    .getAll("preferredNights")
    .map((value) => String(value ?? "").trim().toUpperCase())
    .filter(Boolean);

  const validPreferredNights = Array.from(
    new Set(preferredNightValues.filter(isPreferredNight))
  ) as PreferredNight[];

  const normalizedPreferredNights = validPreferredNights.includes("ANY")
    ? (["ANY"] as PreferredNight[])
    : validPreferredNights;

  const experienceLevel = String(formData.get("experienceLevel") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();

  const wantsFreeKit = isTruthyCheckbox(formData.get("wantsFreeKit"));
  const marketingConsent = isTruthyCheckbox(formData.get("marketingConsent"));

  const interestType = isInterestType(interestTypeRaw)
    ? interestTypeRaw
    : "TEAM";

  const requiresLeagueType =
    interestType === "TEAM" || interestType === "PLAYER";

  if (!contactName || !email || !area) {
    redirect(
      `/register-interest?type=${interestType.toLowerCase()}&error=missing`
    );
  }

  if (requiresLeagueType && !isLeagueType(leagueTypeRaw)) {
    redirect(
      `/register-interest?type=${interestType.toLowerCase()}&error=missing`
    );
  }

  const combinedMessage = [
    experienceLevel ? `Experience: ${experienceLevel}` : "",
    message,
  ]
    .filter(Boolean)
    .join("\n\n");

  const createdLead = await prisma.interestLead.create({
    data: {
      interestType,
      status: LeadStatus.NEW,
      contactName,
      email,
      phone: phone || null,
      teamName: interestType === "TEAM" ? teamName || null : null,
      area,
      leagueType: requiresLeagueType ? (leagueTypeRaw as LeagueType) : null,
      message: combinedMessage || null,
      source: source || "register-interest-page",
      wantsFreeKit: interestType === "TEAM" ? wantsFreeKit : false,
      marketingConsent,
      preferredNights: normalizedPreferredNights.length
        ? {
            create: normalizedPreferredNights.map((night) => ({
              night,
            })),
          }
        : undefined,
    },
    include: {
      preferredNights: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const confirmation = buildConfirmationCopy(interestType);
  const logoUrl = "https://sixfl.co.uk/sixfl-email.png";
  const preferredNightsText = formatPreferredNights(createdLead.preferredNights);

  try {
    await sendEmail({
      to: email,
      subject: confirmation.subject,
      text: [
        `Hi ${contactName},`,
        "",
        confirmation.body,
        "",
        `Type: ${formatInterestType(createdLead.interestType)}`,
        `Area: ${createdLead.area ?? "—"}`,
        `League type: ${formatLeagueType(createdLead.leagueType)}`,
        `Preferred nights: ${preferredNightsText}`,
        interestType === "TEAM"
          ? `Free kit interest: ${formatYesNo(createdLead.wantsFreeKit)}`
          : "",
        "",
        "SIXFL",
        "6-a-side football. Done properly.",
      ]
        .filter(Boolean)
        .join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;background:#f5f7fa;padding:32px 16px;color:#111;">
          <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
            <div style="text-align:center;margin-bottom:24px;">
              <img
                src="${logoUrl}"
                alt="SIXFL"
                width="240"
                style="display:inline-block;max-width:100%;height:auto;"
              />
            </div>

            <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;text-align:center;">
              ${confirmation.heading}
            </h1>

            <p style="margin:0 0 18px;line-height:1.6;">Hi ${contactName},</p>
            <p style="margin:0 0 18px;line-height:1.6;">${confirmation.body}</p>

            <div style="margin:24px 0;padding:16px 18px;border:1px solid #d1d5db;border-radius:12px;background:#f8fafc;">
              <p style="margin:0 0 8px;"><strong>Type:</strong> ${formatInterestType(
                createdLead.interestType
              )}</p>
              <p style="margin:0 0 8px;"><strong>Area:</strong> ${
                createdLead.area ?? "—"
              }</p>
              <p style="margin:0 0 8px;"><strong>League type:</strong> ${formatLeagueType(
                createdLead.leagueType
              )}</p>
              <p style="margin:0 0 8px;"><strong>Preferred nights:</strong> ${preferredNightsText}</p>
              ${
                interestType === "TEAM"
                  ? `<p style="margin:0;"><strong>Free kit interest:</strong> ${formatYesNo(
                      createdLead.wantsFreeKit
                    )}</p>`
                  : ""
              }
            </div>

            <p style="margin:24px 0 0;line-height:1.6;text-align:center;">
              <strong>SIXFL</strong><br />
              6-a-side football. Done properly.
            </p>
          </div>
        </div>
      `,
    });

    await sendEmail({
      to: "hello@sixfl.co.uk",
      subject: `New SIXFL lead: ${formatInterestType(createdLead.interestType)}`,
      text: [
        "New SIXFL lead received",
        "",
        `Type: ${formatInterestType(createdLead.interestType)}`,
        `Name: ${createdLead.contactName}`,
        `Email: ${createdLead.email}`,
        `Phone: ${createdLead.phone ?? "—"}`,
        `Team name: ${createdLead.teamName ?? "—"}`,
        `Area: ${createdLead.area ?? "—"}`,
        `League type: ${formatLeagueType(createdLead.leagueType)}`,
        `Preferred nights: ${preferredNightsText}`,
        `Source: ${createdLead.source ?? "—"}`,
        `Free kit interest: ${formatYesNo(createdLead.wantsFreeKit)}`,
        `Marketing consent: ${formatYesNo(createdLead.marketingConsent)}`,
        `Message: ${createdLead.message ?? "—"}`,
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;background:#f5f7fa;padding:32px 16px;color:#111;">
          <div style="max-width:700px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
            <div style="text-align:center;margin-bottom:24px;">
              <img
                src="${logoUrl}"
                alt="SIXFL"
                width="180"
                style="display:inline-block;max-width:100%;height:auto;"
              />
            </div>

            <h1 style="margin:0 0 16px;font-size:26px;text-align:center;">
              New SIXFL lead received
            </h1>

            <div style="padding:16px 18px;border:1px solid #d1d5db;border-radius:12px;background:#f8fafc;">
              <p style="margin:0 0 8px;"><strong>Type:</strong> ${formatInterestType(
                createdLead.interestType
              )}</p>
              <p style="margin:0 0 8px;"><strong>Name:</strong> ${createdLead.contactName}</p>
              <p style="margin:0 0 8px;"><strong>Email:</strong> ${createdLead.email}</p>
              <p style="margin:0 0 8px;"><strong>Phone:</strong> ${createdLead.phone ?? "—"}</p>
              <p style="margin:0 0 8px;"><strong>Team name:</strong> ${createdLead.teamName ?? "—"}</p>
              <p style="margin:0 0 8px;"><strong>Area:</strong> ${createdLead.area ?? "—"}</p>
              <p style="margin:0 0 8px;"><strong>League type:</strong> ${formatLeagueType(
                createdLead.leagueType
              )}</p>
              <p style="margin:0 0 8px;"><strong>Preferred nights:</strong> ${preferredNightsText}</p>
              <p style="margin:0 0 8px;"><strong>Source:</strong> ${createdLead.source ?? "—"}</p>
              <p style="margin:0 0 8px;"><strong>Free kit interest:</strong> ${formatYesNo(
                createdLead.wantsFreeKit
              )}</p>
              <p style="margin:0 0 8px;"><strong>Marketing consent:</strong> ${formatYesNo(
                createdLead.marketingConsent
              )}</p>
              <p style="margin:0;"><strong>Message:</strong> ${createdLead.message ?? "—"}</p>
            </div>
          </div>
        </div>
      `,
    });
  } catch (error) {
    console.error("Interest lead email send failed:", error);
  }

  redirect(`/register-interest/success?type=${interestType.toLowerCase()}`);
}