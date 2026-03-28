// ========================================
// File: src/app/admin/leads/actions.ts
// ========================================

"use server";

// ========================================
// Imports
// ========================================

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { InterestType, LeadStatus, PreferredNight } from "@prisma/client";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  appendSIXFLTextSignature,
  buildSIXFLEmailHtml,
  type SIXFLEmailCta,
} from "@/lib/email/buildEmail";

// ========================================
// Constants
// ========================================

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_BULK_EMAIL_CTA: SIXFLEmailCta = {
  url: "https://www.sixfl.co.uk/register-interest",
  label: "Register your interest",
};

// ========================================
// Helpers
// ========================================

function getPersonalisationValues(contactName?: string | null) {
  const fullName = contactName?.trim() || "";
  const firstName = fullName.split(/\s+/)[0] || "there";

  return {
    fullName,
    firstName,
  };
}

function personaliseTemplateText(text: string, contactName?: string | null) {
  const { fullName, firstName } = getPersonalisationValues(contactName);

  return text
    .replace(/{{firstName}}/gi, firstName)
    .replace(/{{name}}/gi, fullName || firstName)
    .replace(/Hi there/gi, `Hi ${firstName}`);
}

function isLeadStatus(value: string): value is LeadStatus {
  return (
    value === "NEW" ||
    value === "CONTACTED" ||
    value === "QUALIFIED" ||
    value === "CLOSED"
  );
}

function isInterestType(value: string): value is InterestType {
  return value === "TEAM" || value === "PLAYER" || value === "REFEREE";
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

// ========================================
// Actions
// ========================================

export async function updateLeadStatus(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim().toUpperCase();
  const returnTo = String(formData.get("returnTo") ?? "/admin/leads").trim();

  if (!id || !isLeadStatus(statusRaw)) {
    redirect(returnTo || "/admin/leads");
  }

  await prisma.interestLead.update({
    where: { id },
    data: {
      status: statusRaw,
      ...(statusRaw === "CONTACTED" ? { contactedAt: new Date() } : {}),
      ...(statusRaw === "CLOSED" ? { closedAt: new Date() } : {}),
    },
  });

  redirect(returnTo || "/admin/leads");
}

export async function sendBulkLeadEmailAction(formData: FormData) {
  await requireAdmin();

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  const selectedTypeRaw = String(formData.get("selectedType") ?? "")
    .trim()
    .toUpperCase();
  const selectedStatusRaw = String(formData.get("selectedStatus") ?? "")
    .trim()
    .toUpperCase();
  const selectedArea = String(formData.get("selectedArea") ?? "").trim();
  const selectedNightRaw = String(formData.get("selectedNight") ?? "")
    .trim()
    .toUpperCase();

  const includedLeadIds = formData
    .getAll("includedLeadIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!subject) {
    return {
      ok: false,
      error: "Please enter a subject.",
    };
  }

  if (!body) {
    return {
      ok: false,
      error: "Please enter a message.",
    };
  }

  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      error: "RESEND_API_KEY is missing from your environment variables.",
    };
  }

  if (!process.env.EMAIL_FROM) {
    return {
      ok: false,
      error: "EMAIL_FROM is missing from your environment variables.",
    };
  }

  const where = {
    ...(selectedTypeRaw && isInterestType(selectedTypeRaw)
      ? { interestType: selectedTypeRaw as InterestType }
      : {}),
    ...(selectedStatusRaw && isLeadStatus(selectedStatusRaw)
      ? { status: selectedStatusRaw as LeadStatus }
      : {}),
    ...(selectedArea ? { area: selectedArea } : {}),
    ...(selectedNightRaw && isPreferredNight(selectedNightRaw)
      ? {
          preferredNights: {
            some: {
              night: selectedNightRaw as PreferredNight,
            },
          },
        }
      : {}),
    email: {
      not: "",
    },
    ...(includedLeadIds.length > 0
      ? {
          id: {
            in: includedLeadIds,
          },
        }
      : {}),
  };

  const leads = await prisma.interestLead.findMany({
    where,
    select: {
      id: true,
      email: true,
      status: true,
      contactName: true,
    },
  });

  const validLeads = leads.filter((lead) => lead.email?.trim());

  if (validLeads.length === 0) {
    return {
      ok: false,
      error: "No matching recipients were found for this bulk email.",
    };
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const lead of validLeads) {
    try {
      const email = lead.email?.trim();

      if (!email) {
        failedCount += 1;
        continue;
      }

      const personalisedSubject = personaliseTemplateText(
        subject,
        lead.contactName,
      );
      const personalisedBody = personaliseTemplateText(body, lead.contactName);

      const signedTextBody = appendSIXFLTextSignature(personalisedBody);
      const signedHtmlBody = buildSIXFLEmailHtml({
        body: signedTextBody,
        cta: DEFAULT_BULK_EMAIL_CTA,
      });

      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: personalisedSubject,
        text: signedTextBody,
        html: signedHtmlBody,
      });

      await prisma.interestLeadEmail.create({
        data: {
          interestLeadId: lead.id,
          subject: personalisedSubject,
          body: signedTextBody,
          sentTo: email,
        },
      });

      if (lead.status === "NEW") {
        await prisma.interestLead.update({
          where: { id: lead.id },
          data: {
            status: "CONTACTED",
            contactedAt: new Date(),
          },
        });
      }

      sentCount += 1;
    } catch (error) {
      console.error("sendBulkLeadEmailAction item error", lead.id, error);
      failedCount += 1;
    }
  }

  revalidatePath("/admin/leads");

  return {
    ok: true,
    sentCount,
    failedCount,
  };
}