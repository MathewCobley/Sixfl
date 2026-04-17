// ========================================
// File: src/app/captain/team/[teamid]/prospects/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Resend } from "resend";
import { NotificationAudience, NotificationChannel } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { queueDirectNotification } from "@/lib/notifications/service";
import {
  appendSIXFLTextSignature,
  buildSIXFLEmailHtml,
} from "@/lib/email/buildEmail";

const resend = new Resend(process.env.RESEND_API_KEY);

const ALLOWED_PROSPECT_STATUSES = [
  "NEW",
  "CONTACTED",
  "TRIAL",
  "ACTIVE_SQUAD",
  "BACKUP",
  "DECLINED",
] as const;

type ProspectStatus = (typeof ALLOWED_PROSPECT_STATUSES)[number];

function normaliseNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed ? parsed : null;
}

function getProspectStatus(value: FormDataEntryValue | null): ProspectStatus {
  const parsed = String(value ?? "").trim().toUpperCase();

  if (ALLOWED_PROSPECT_STATUSES.includes(parsed as ProspectStatus)) {
    return parsed as ProspectStatus;
  }

  return "NEW";
}

function buildProspectsRedirect(teamid: string, query: string) {
  return `/captain/team/${teamid}/prospects${query}`;
}

function getProspectDisplayName(input: {
  firstName: string;
  lastName: string | null;
}) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

function personaliseProspectText(
  text: string,
  prospect: {
    firstName: string;
    lastName: string | null;
    email: string | null;
  },
  team: {
    name: string;
    joinSlug: string | null;
  },
) {
  const fullName = getProspectDisplayName({
    firstName: prospect.firstName,
    lastName: prospect.lastName,
  });
  const firstName = prospect.firstName.trim() || "there";
  const joinUrl = team.joinSlug
    ? `${process.env.NEXTAUTH_URL ?? "https://www.sixfl.co.uk"}/teams/join/${team.joinSlug}`
    : `${process.env.NEXTAUTH_URL ?? "https://www.sixfl.co.uk"}/register-interest`;

  return text
    .replace(/{{firstName}}/gi, firstName)
    .replace(/{{name}}/gi, fullName || firstName)
    .replace(/{{fullName}}/gi, fullName || firstName)
    .replace(/{{teamName}}/gi, team.name)
    .replace(/{{joinUrl}}/gi, joinUrl)
    .replace(/{{email}}/gi, prospect.email ?? "")
    .replace(/Hi there/gi, `Hi ${firstName}`);
}

async function getProspectForTeam(teamid: string, prospectId: string) {
  return prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId: teamid,
    },
  });
}

export async function addProspectAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();

  await requireCaptain(teamid);

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = normaliseNullableString(formData.get("lastName"));
  const email = normaliseNullableString(formData.get("email"))?.toLowerCase() ?? null;
  const phone = normaliseNullableString(formData.get("phone"));
  const preferredPositions = normaliseNullableString(
    formData.get("preferredPositions"),
  );
  const experienceSummary = normaliseNullableString(
    formData.get("experienceSummary"),
  );
  const availabilitySummary = normaliseNullableString(
    formData.get("availabilitySummary"),
  );
  const source = normaliseNullableString(formData.get("source"));
  const notes = normaliseNullableString(formData.get("notes"));

  if (!teamid) {
    redirect("/captain");
  }

  if (!firstName) {
    redirect(buildProspectsRedirect(teamid, "?error=First%20name%20is%20required."));
  }

  await prisma.teamPlayerProspect.create({
    data: {
      teamId: teamid,
      firstName,
      lastName,
      email,
      phone,
      preferredPositions,
      experienceSummary,
      availabilitySummary,
      source,
      notes,
      status: "NEW",
    },
  });

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=prospect-added"));
}

export async function updateProspectStatusAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const status = getProspectStatus(formData.get("status"));

  await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  const existing = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId: teamid,
    },
    select: { id: true },
  });

  if (!existing) {
    redirect(buildProspectsRedirect(teamid, "?error=Prospect%20not%20found."));
  }

  await prisma.teamPlayerProspect.update({
    where: { id: prospectId },
    data: {
      status,
      lastContactedAt:
        status === "CONTACTED" || status === "TRIAL" ? new Date() : undefined,
    },
  });

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=status-updated"));
}

export async function updateProspectNotesAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const notes = normaliseNullableString(formData.get("notes"));

  await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  const existing = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId: teamid,
    },
    select: { id: true },
  });

  if (!existing) {
    redirect(buildProspectsRedirect(teamid, "?error=Prospect%20not%20found."));
  }

  await prisma.teamPlayerProspect.update({
    where: { id: prospectId },
    data: { notes },
  });

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=notes-updated"));
}

export async function sendProspectEmailAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  const { user } = await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  if (!subject) {
    redirect(buildProspectsRedirect(teamid, "?error=Email%20subject%20is%20required."));
  }

  if (!body) {
    redirect(buildProspectsRedirect(teamid, "?error=Email%20body%20is%20required."));
  }

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    redirect(buildProspectsRedirect(teamid, "?error=Email%20is%20not%20configured%20yet."));
  }

  const [team, prospect] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
        joinSlug: true,
      },
    }),
    getProspectForTeam(teamid, prospectId),
  ]);

  if (!team || !prospect) {
    redirect(buildProspectsRedirect(teamid, "?error=Prospect%20not%20found."));
  }

  if (!prospect.email?.trim()) {
    redirect(buildProspectsRedirect(teamid, "?error=Prospect%20does%20not%20have%20an%20email%20address."));
  }

  const personalisedSubject = personaliseProspectText(subject, prospect, team);
  const personalisedBody = personaliseProspectText(body, prospect, team);
  const signedTextBody = appendSIXFLTextSignature(personalisedBody);
  const signedHtmlBody = buildSIXFLEmailHtml({ body: signedTextBody });

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: prospect.email.trim(),
    subject: personalisedSubject,
    text: signedTextBody,
    html: signedHtmlBody,
  });

  await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: {
      status: prospect.status === "NEW" ? "CONTACTED" : prospect.status,
      lastContactedAt: new Date(),
    },
  });

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=email-sent"));
}

export async function sendProspectSmsAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  const { user } = await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  if (!body) {
    redirect(buildProspectsRedirect(teamid, "?error=SMS%20body%20is%20required."));
  }

  const [team, prospect] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
        joinSlug: true,
      },
    }),
    getProspectForTeam(teamid, prospectId),
  ]);

  if (!team || !prospect) {
    redirect(buildProspectsRedirect(teamid, "?error=Prospect%20not%20found."));
  }

  if (!prospect.phone?.trim()) {
    redirect(buildProspectsRedirect(teamid, "?error=Prospect%20does%20not%20have%20a%20mobile%20number."));
  }

  const personalisedBody = personaliseProspectText(body, prospect, team);

  const recipient = await prisma.notificationRecipient.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: "GENERAL",
        sourceId: `team-prospect:${prospect.id}`,
      },
    },
    update: {
      audience: NotificationAudience.PLAYER,
      displayName: getProspectDisplayName({
        firstName: prospect.firstName,
        lastName: prospect.lastName,
      }),
      phone: prospect.phone.trim(),
      transactionalSmsOptIn: true,
      marketingSmsOptIn: true,
    },
    create: {
      sourceType: "GENERAL",
      sourceId: `team-prospect:${prospect.id}`,
      audience: NotificationAudience.PLAYER,
      displayName: getProspectDisplayName({
        firstName: prospect.firstName,
        lastName: prospect.lastName,
      }),
      phone: prospect.phone.trim(),
      transactionalSmsOptIn: true,
      marketingSmsOptIn: true,
    },
  });

  await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.SMS,
    audience: NotificationAudience.PLAYER,
    body: personalisedBody,
    isTransactional: false,
    sourceType: "TEAM_PLAYER_PROSPECT",
    sourceId: prospect.id,
    metadata: {
      origin: "captain_prospect_sms",
      originLabel: "Sent to prospect from captain hub",
      teamId: teamid,
      prospectId: prospect.id,
    },
    createdByUserId: user?.id ?? null,
  });

  await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: {
      status: prospect.status === "NEW" ? "CONTACTED" : prospect.status,
      lastContactedAt: new Date(),
    },
  });

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=sms-sent"));
}

export async function convertProspectToMemberAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  const prospect = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId: teamid,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  });

  if (!prospect) {
    redirect(buildProspectsRedirect(teamid, "?error=Prospect%20not%20found."));
  }

  if (!prospect.email) {
    redirect(
      buildProspectsRedirect(
        teamid,
        "?error=Prospect%20needs%20an%20email%20linked%20to%20a%20SIXFL%20account%20before%20promotion.",
      ),
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: prospect.email.toLowerCase() },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user) {
    redirect(
      buildProspectsRedirect(
        teamid,
        "?error=No%20existing%20SIXFL%20user%20was%20found%20for%20that%20email.",
      ),
    );
  }

  const existingMembership = await prisma.teamMember.findUnique({
    where: {
      userId_teamId: {
        userId: user.id,
        teamId: teamid,
      },
    },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    if (!existingMembership) {
      await tx.teamMember.create({
        data: {
          teamId: teamid,
          userId: user.id,
          role: "PLAYER",
        },
      });
    }

    await tx.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: {
        status: "ACTIVE_SQUAD",
        lastContactedAt: new Date(),
      },
    });
  });

  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=promoted"));
}
