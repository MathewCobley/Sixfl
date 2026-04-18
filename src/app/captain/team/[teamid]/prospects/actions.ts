// ========================================
// File: src/app/captain/team/[teamid]/prospects/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotificationAudience, NotificationChannel } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { queueDirectNotification } from "@/lib/notifications/service";
import {
  linkDispatchToThread,
  linkQueuedEmailDispatchToThread,
} from "@/lib/messaging/service";
import { normalizePhoneNumber } from "@/lib/messaging/phone";

const ALLOWED_PROSPECT_STATUSES = [
  "NEW",
  "CONTACTED",
  "TRIAL",
  "ACTIVE_SQUAD",
  "BACKUP",
  "DECLINED",
] as const;
const PROSPECT_JOIN_CTA_LABEL = "Register as a Player";

type ProspectStatus = (typeof ALLOWED_PROSPECT_STATUSES)[number];

type ProspectForMessaging = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

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

function getProspectJoinUrl(team: { joinSlug: string | null }) {
  return team.joinSlug
    ? `${process.env.NEXTAUTH_URL ?? "https://www.sixfl.co.uk"}/teams/join/${team.joinSlug}`
    : `${process.env.NEXTAUTH_URL ?? "https://www.sixfl.co.uk"}/register-interest`;
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
  const joinUrl = getProspectJoinUrl(team);

  return text
    .replace(/{{firstName}}/gi, firstName)
    .replace(/{{name}}/gi, fullName || firstName)
    .replace(/{{fullName}}/gi, fullName || firstName)
    .replace(/{{teamName}}/gi, team.name)
    .replace(/{{joinUrl}}/gi, joinUrl)
    .replace(/{{email}}/gi, prospect.email ?? "")
    .replace(/Hi there/gi, `Hi ${firstName}`);
}

function getProspectEmailCta(input: {
  body: string;
  joinUrl: string;
}) {
  if (!/{{\s*cta\s*}}/i.test(input.body)) {
    return undefined;
  }

  return {
    label: PROSPECT_JOIN_CTA_LABEL,
    url: input.joinUrl,
  };
}

function getProspectRecipientSourceId(prospectId: string) {
  return `team-prospect:${prospectId}`;
}

async function ensureProspectNotificationRecipient(input: {
  teamId: string;
  teamName: string;
  prospect: ProspectForMessaging;
}) {
  const displayName = getProspectDisplayName({
    firstName: input.prospect.firstName,
    lastName: input.prospect.lastName,
  });
  const email = input.prospect.email?.trim().toLowerCase() || null;
  const phone = input.prospect.phone?.trim() || null;
  const phoneNormalized = normalizePhoneNumber(phone);

  const recipient = await prisma.notificationRecipient.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: "GENERAL",
        sourceId: getProspectRecipientSourceId(input.prospect.id),
      },
    },
    update: {
      audience: NotificationAudience.PLAYER,
      displayName: displayName || null,
      email,
      emailNormalized: email,
      phone,
      phoneNormalized,
      transactionalEmailOptIn: true,
      marketingEmailOptIn: true,
      transactionalSmsOptIn: true,
      marketingSmsOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        prospectId: input.prospect.id,
        contactName: displayName || null,
      },
      lastSyncedAt: new Date(),
    },
    create: {
      sourceType: "GENERAL",
      sourceId: getProspectRecipientSourceId(input.prospect.id),
      audience: NotificationAudience.PLAYER,
      displayName: displayName || null,
      email,
      emailNormalized: email,
      phone,
      phoneNormalized,
      transactionalEmailOptIn: true,
      marketingEmailOptIn: true,
      transactionalSmsOptIn: true,
      marketingSmsOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        prospectId: input.prospect.id,
        contactName: displayName || null,
      },
      lastSyncedAt: new Date(),
    },
  });

  await prisma.notificationPreference.upsert({
    where: {
      recipientId: recipient.id,
    },
    update: {
      emailEnabled: true,
      smsEnabled: true,
      urgentSmsEnabled: true,
      marketingEmailEnabled: true,
      marketingSmsEnabled: true,
    },
    create: {
      recipientId: recipient.id,
      emailEnabled: true,
      smsEnabled: true,
      urgentSmsEnabled: true,
      marketingEmailEnabled: true,
      marketingSmsEnabled: true,
    },
  });

  return recipient;
}

async function getProspectForTeam(teamid: string, prospectId: string) {
  return prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId: teamid,
    },
  });
}

async function getProspectsForTeam(input: {
  teamid: string;
  prospectIds: string[];
}) {
  return prisma.teamPlayerProspect.findMany({
    where: {
      teamId: input.teamid,
      ...(input.prospectIds.length > 0
        ? {
            id: {
              in: input.prospectIds,
            },
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

async function markProspectsContacted(prospectIds: string[]) {
  if (prospectIds.length === 0) return;

  await prisma.teamPlayerProspect.updateMany({
    where: {
      id: {
        in: prospectIds,
      },
    },
    data: {
      lastContactedAt: new Date(),
    },
  });

  await prisma.teamPlayerProspect.updateMany({
    where: {
      id: {
        in: prospectIds,
      },
      status: "NEW",
    },
    data: {
      status: "CONTACTED",
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

export async function updateProspectDetailsAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = normaliseNullableString(formData.get("lastName"));
  const email = normaliseNullableString(formData.get("email"))?.toLowerCase() ?? null;
  const phone = normaliseNullableString(formData.get("phone"));

  await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  if (!firstName) {
    redirect(buildProspectsRedirect(teamid, "?error=First%20name%20is%20required."));
  }

  const [team, existing] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.teamPlayerProspect.findFirst({
      where: {
        id: prospectId,
        teamId: teamid,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    }),
  ]);

  if (!team || !existing) {
    redirect(buildProspectsRedirect(teamid, "?error=Prospect%20not%20found."));
  }

  await prisma.teamPlayerProspect.update({
    where: { id: prospectId },
    data: {
      firstName,
      lastName,
      email,
      phone,
    },
  });

  await ensureProspectNotificationRecipient({
    teamId: teamid,
    teamName: team.name,
    prospect: {
      id: prospectId,
      firstName,
      lastName,
      email,
      phone,
    },
  });

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=details-updated"));
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
  const joinUrl = getProspectJoinUrl(team);
  const recipient = await ensureProspectNotificationRecipient({
    teamId: teamid,
    teamName: team.name,
    prospect,
  });
  const contactName = getProspectDisplayName({
    firstName: prospect.firstName,
    lastName: prospect.lastName,
  });

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.PLAYER,
    subject: personalisedSubject,
    body: personalisedBody,
    isTransactional: false,
    sourceType: "TEAM_PLAYER_PROSPECT",
    sourceId: prospect.id,
    emailCta: getProspectEmailCta({
      body: personalisedBody,
      joinUrl,
    }),
    metadata: {
      origin: "captain_prospect_email",
      originLabel: "Sent to prospect from captain hub",
      teamId: teamid,
      prospectId: prospect.id,
      contactName,
    },
    createdByUserId: user?.id ?? null,
  });

  await linkQueuedEmailDispatchToThread({
    notificationDispatchId: dispatch.id,
    recipientId: recipient.id,
    teamId: teamid,
    sourceType: "TEAM_PLAYER_PROSPECT",
    sourceId: prospect.id,
    contactName,
    toEmail: prospect.email,
    subject: dispatch.subject ?? personalisedSubject,
    bodyText: dispatch.bodyText,
    bodyHtml: dispatch.bodyHtml,
    createdByUserId: user?.id ?? null,
  });

  await markProspectsContacted([prospect.id]);

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

  const recipient = await ensureProspectNotificationRecipient({
    teamId: teamid,
    teamName: team.name,
    prospect,
  });
  const contactName = getProspectDisplayName({
    firstName: prospect.firstName,
    lastName: prospect.lastName,
  });

  const dispatch = await queueDirectNotification({
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
      contactName,
    },
    createdByUserId: user?.id ?? null,
  });

  await linkDispatchToThread({
    dispatchId: dispatch.id,
    recipientId: recipient.id,
    teamId: teamid,
    sourceType: "TEAM_PLAYER_PROSPECT",
    sourceId: prospect.id,
    contactName,
    phone: prospect.phone,
    body: dispatch.bodyText,
    providerStatus: "queued",
    createdByUserId: user?.id ?? null,
    sentAt: null,
  });

  await markProspectsContacted([prospect.id]);

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=sms-sent"));
}

export async function sendBulkProspectEmailAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const prospectIds = formData
    .getAll("prospectIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const { user } = await requireCaptain(teamid);

  if (!teamid) {
    redirect("/captain");
  }

  if (!subject) {
    redirect(buildProspectsRedirect(teamid, "?error=Bulk%20email%20subject%20is%20required."));
  }

  if (!body) {
    redirect(buildProspectsRedirect(teamid, "?error=Bulk%20email%20body%20is%20required."));
  }

  const [team, prospects] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
        joinSlug: true,
      },
    }),
    getProspectsForTeam({ teamid, prospectIds }),
  ]);

  if (!team) {
    redirect(buildProspectsRedirect(teamid, "?error=Team%20not%20found."));
  }

  const recipients = prospects.filter((prospect) => Boolean(prospect.email?.trim()));

  if (recipients.length === 0) {
    redirect(buildProspectsRedirect(teamid, "?error=No%20prospects%20with%20email%20were%20selected."));
  }

  const joinUrl = getProspectJoinUrl(team);

  for (const prospect of recipients) {
    const personalisedSubject = personaliseProspectText(subject, prospect, team);
    const personalisedBody = personaliseProspectText(body, prospect, team);
    const recipient = await ensureProspectNotificationRecipient({
      teamId: teamid,
      teamName: team.name,
      prospect,
    });
    const contactName = getProspectDisplayName({
      firstName: prospect.firstName,
      lastName: prospect.lastName,
    });

    const dispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.PLAYER,
      subject: personalisedSubject,
      body: personalisedBody,
      isTransactional: false,
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospect.id,
      emailCta: getProspectEmailCta({
        body: personalisedBody,
        joinUrl,
      }),
      metadata: {
        origin: "captain_prospect_email_bulk",
        originLabel: "Bulk email to prospects from captain hub",
        teamId: teamid,
        prospectId: prospect.id,
        contactName,
      },
      createdByUserId: user?.id ?? null,
    });

    await linkQueuedEmailDispatchToThread({
      notificationDispatchId: dispatch.id,
      recipientId: recipient.id,
      teamId: teamid,
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospect.id,
      contactName,
      toEmail: prospect.email,
      subject: dispatch.subject ?? personalisedSubject,
      bodyText: dispatch.bodyText,
      bodyHtml: dispatch.bodyHtml,
      createdByUserId: user?.id ?? null,
    });
  }

  await markProspectsContacted(recipients.map((prospect) => prospect.id));

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=bulk-email-sent"));
}

export async function sendBulkProspectSmsAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const prospectIds = formData
    .getAll("prospectIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const { user } = await requireCaptain(teamid);

  if (!teamid) {
    redirect("/captain");
  }

  if (!body) {
    redirect(buildProspectsRedirect(teamid, "?error=Bulk%20SMS%20body%20is%20required."));
  }

  const [team, prospects] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
        joinSlug: true,
      },
    }),
    getProspectsForTeam({ teamid, prospectIds }),
  ]);

  if (!team) {
    redirect(buildProspectsRedirect(teamid, "?error=Team%20not%20found."));
  }

  const recipients = prospects.filter((prospect) => Boolean(prospect.phone?.trim()));

  if (recipients.length === 0) {
    redirect(buildProspectsRedirect(teamid, "?error=No%20prospects%20with%20a%20mobile%20number%20were%20selected."));
  }

  for (const prospect of recipients) {
    const personalisedBody = personaliseProspectText(body, prospect, team);
    const recipient = await ensureProspectNotificationRecipient({
      teamId: teamid,
      teamName: team.name,
      prospect,
    });
    const contactName = getProspectDisplayName({
      firstName: prospect.firstName,
      lastName: prospect.lastName,
    });

    const dispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.SMS,
      audience: NotificationAudience.PLAYER,
      body: personalisedBody,
      isTransactional: false,
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospect.id,
      metadata: {
        origin: "captain_prospect_sms_bulk",
        originLabel: "Bulk SMS to prospects from captain hub",
        teamId: teamid,
        prospectId: prospect.id,
        contactName,
      },
      createdByUserId: user?.id ?? null,
    });

    await linkDispatchToThread({
      dispatchId: dispatch.id,
      recipientId: recipient.id,
      teamId: teamid,
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospect.id,
      contactName,
      phone: prospect.phone,
      body: dispatch.bodyText,
      providerStatus: "queued",
      createdByUserId: user?.id ?? null,
      sentAt: null,
    });
  }

  await markProspectsContacted(recipients.map((prospect) => prospect.id));

  revalidatePath(`/captain/team/${teamid}/prospects`);
  redirect(buildProspectsRedirect(teamid, "?saved=bulk-sms-sent"));
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
