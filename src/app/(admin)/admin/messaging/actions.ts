// ========================================
// File: src/app/(admin)/admin/messaging/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  appendSIXFLTextSignature,
  buildSIXFLEmailHtml,
} from "@/lib/email/buildEmail";
import {
  buildBaseEmailTemplateContext,
  mergeEmailTemplateContext,
  resolveTemplateText,
} from "@/lib/email/template-context";
import { buildLeadResponseUrls } from "@/lib/leads/responseLinks";

const resend = new Resend(process.env.RESEND_API_KEY);
const CTA_PLACEHOLDER_TOKEN = "__SIXFL_CTA__";

export type AdminMessagingActionState = {
  ok?: boolean;
  error?: string;
  sentCount?: number;
  failedCount?: number;
};

function buildLeadEmailContext(input: {
  contactName?: string | null;
  area?: string | null;
  signupUrl?: string | null;
  teamName?: string | null;
}) {
  const fullName = input.contactName?.trim() || "";
  const firstName = fullName.split(/\s+/)[0] || "there";

  return mergeEmailTemplateContext(
    buildBaseEmailTemplateContext({
      firstName,
      fullName,
      area: input.area,
      signupUrl: input.signupUrl,
      teamName: input.teamName,
    }),
  );
}

function resolveLeadEmailCta(input: {
  ctaLabel?: string | null;
  ctaUrlKey?: string | null;
  signupUrl?: string | null;
}) {
  const label = input.ctaLabel?.trim() || "";
  const urlKey = input.ctaUrlKey?.trim() || "";

  if (!label || !urlKey) {
    return undefined;
  }

  if (urlKey === "signupUrl") {
    const url = input.signupUrl?.trim() || "";

    if (!url) {
      return undefined;
    }

    return {
      label,
      url,
    };
  }

  return undefined;
}

export async function sendAdminLeadCampaignAction(
  _prevState: AdminMessagingActionState,
  formData: FormData,
): Promise<AdminMessagingActionState> {
  await requireAdmin();

  const subjectInput = String(formData.get("subject") ?? "").trim();
  const bodyInput = String(formData.get("body") ?? "").trim();
  const ctaLabelInput = String(formData.get("ctaLabel") ?? "").trim();
  const ctaUrlKeyInput = String(formData.get("ctaUrlKey") ?? "").trim();
  const includedLeadIds = formData
    .getAll("includedLeadIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!subjectInput) {
    return { ok: false, error: "Please enter a subject." };
  }

  if (!bodyInput) {
    return { ok: false, error: "Please enter an email message." };
  }

  if (includedLeadIds.length === 0) {
    return { ok: false, error: "Select at least one recipient." };
  }

  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      error: "RESEND_API_KEY is missing from your environment variables.",
    };
  }

  const fromEmail = process.env.EMAIL_FROM;

  if (!fromEmail) {
    return {
      ok: false,
      error: "EMAIL_FROM is missing from your environment variables.",
    };
  }

  const leads = await prisma.interestLead.findMany({
    where: {
      id: {
        in: includedLeadIds,
      },
    },
    select: {
      id: true,
      email: true,
      contactName: true,
      area: true,
      teamName: true,
      status: true,
      league: {
        select: {
          slug: true,
        },
      },
    },
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const lead of leads) {
    const leadEmail = lead.email?.trim() || "";

    if (!leadEmail) {
      failedCount += 1;
      continue;
    }

    try {
      const signupUrl = lead.league?.slug
        ? `https://www.sixfl.co.uk/leagues/${lead.league.slug}`
        : "https://www.sixfl.co.uk/register-interest";

      const context = mergeEmailTemplateContext(
        buildLeadEmailContext({
          contactName: lead.contactName,
          area: lead.area,
          signupUrl,
          teamName: lead.teamName,
        }),
        buildLeadResponseUrls(lead.id),
      );

      const resolvedSubject = resolveTemplateText(subjectInput, context);
      const resolvedBody = resolveTemplateText(
        bodyInput.replaceAll("{{cta}}", CTA_PLACEHOLDER_TOKEN),
        context,
      ).replaceAll(CTA_PLACEHOLDER_TOKEN, "{{cta}}");

      const resolvedCta = resolveLeadEmailCta({
        ctaLabel: ctaLabelInput,
        ctaUrlKey: ctaUrlKeyInput,
        signupUrl,
      });

      const signedTextBody = appendSIXFLTextSignature(resolvedBody);
      const signedHtmlBody = buildSIXFLEmailHtml({
        body: signedTextBody,
        cta: resolvedCta,
      });

      await resend.emails.send({
        from: fromEmail,
        to: leadEmail,
        subject: resolvedSubject,
        text: signedTextBody,
        html: signedHtmlBody,
      });

      await prisma.interestLeadEmail.create({
        data: {
          interestLeadId: lead.id,
          subject: resolvedSubject,
          body: signedTextBody,
          sentTo: leadEmail,
        },
      });

      if (lead.status === LeadStatus.NEW) {
        await prisma.interestLead.update({
          where: { id: lead.id },
          data: {
            status: LeadStatus.CONTACTED,
            contactedAt: new Date(),
          },
        });
      }

      sentCount += 1;
    } catch (error) {
      console.error("sendAdminLeadCampaignAction error", {
        leadId: lead.id,
        error,
      });
      failedCount += 1;
    }
  }

  revalidatePath("/admin/leads");
  revalidatePath("/admin/messaging");

  return {
    ok: true,
    sentCount,
    failedCount,
  };
}
