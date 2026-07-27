// ========================================
// File: src/app/(admin)/admin/player-pool/actions.ts
// ========================================

"use server";

import {
  NotificationAudience,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { sendEmail } from "@/lib/email";
import {
  PLAYER_POOL_PROFILE_STATUSES,
  PLAYER_POOL_REQUEST_STATUSES,
  createPlayerPoolId,
  createPlayerPoolPublicCode,
  createPlayerPoolToken,
  ensurePlayerPoolTables,
  getPlayerPoolBaseUrl,
  normalizePlayerPoolEmail,
  splitPlayerPoolName,
} from "@/lib/player-pool/storage";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY =
  "player-pool-profile-invite-email";

type ExistingProfileRow = {
  id: string;
  prospectId: string;
  profileToken: string;
  publicCode: string;
};

type IntroductionRow = {
  requestId: string;
  profileId: string;
  publicCode: string;
  profileStatus: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  ageBand: string | null;
  preferredPositions: string | null;
  preferredPosition: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: unknown;
  availabilitySummary: string | null;
  area: string | null;
  teamId: string;
  teamName: string;
  teamContactName: string | null;
  teamContactEmail: string | null;
  teamContactPhone: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
};

function adminPath(query = "") {
  return `/admin/player-pool${query}`;
}

function fullName(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function formatNights(value: unknown) {
  if (!Array.isArray(value)) return "Flexible";
  const nights = value.filter((item): item is string => typeof item === "string");
  if (!nights.length || nights.includes("ANY")) return "Flexible";
  return nights.map((night) => night.charAt(0) + night.slice(1).toLowerCase()).join(", ");
}

export async function sendPlayerPoolProfileInviteAction(formData: FormData) {
  const { user } = await requireAdmin();
  await ensurePlayerPoolTables();

  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!leadId) redirect(adminPath("?error=Player%20lead%20not%20found."));

  const lead = await prisma.interestLead.findFirst({
    where: { id: leadId, interestType: "PLAYER" },
    include: {
      preferredNights: { orderBy: { createdAt: "asc" } },
      league: { select: { id: true, name: true } },
    },
  });

  if (!lead?.email?.trim()) {
    redirect(adminPath("?error=That%20player%20does%20not%20have%20an%20email%20address."));
  }

  const email = normalizePlayerPoolEmail(lead.email);
  const { firstName, lastName } = splitPlayerPoolName(lead.contactName);
  const nights = lead.preferredNights.map((item) => item.night);

  const existingRows = await prisma.$queryRaw<ExistingProfileRow[]>`
    SELECT "id", "prospectId", "profileToken", "publicCode"
    FROM "PlayerPoolProfile"
    WHERE "emailNormalized" = ${email}
    LIMIT 1
  `;
  const existingProfile = existingRows[0] ?? null;

  let prospectId: string | null = existingProfile?.prospectId ?? null;

  if (!prospectId) {
    const existingProspect = await prisma.teamPlayerProspect.findFirst({
      where: {
        teamId: null,
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true },
    });
    prospectId = existingProspect?.id ?? null;
  }

  if (prospectId) {
    await prisma.teamPlayerProspect.update({
      where: { id: prospectId },
      data: {
        teamId: null,
        firstName,
        lastName,
        email,
        phone: lead.phone || undefined,
        preferredNights: nights.length ? (nights as Prisma.InputJsonValue) : undefined,
        source: "SIXFL PlayerPool",
      },
    });
  } else {
    const prospect = await prisma.teamPlayerProspect.create({
      data: {
        teamId: null,
        firstName,
        lastName,
        email,
        phone: lead.phone,
        preferredNights: nights.length ? (nights as Prisma.InputJsonValue) : undefined,
        source: "SIXFL PlayerPool",
        status: PLAYER_POOL_PROFILE_STATUSES.INVITED,
      },
      select: { id: true },
    });
    prospectId = prospect.id;
  }

  const profileId = existingProfile?.id ?? createPlayerPoolId();
  const profileToken = existingProfile?.profileToken ?? createPlayerPoolToken();
  const publicCode = existingProfile?.publicCode ?? createPlayerPoolPublicCode();
  const currentStatusRows = existingProfile
    ? await prisma.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "PlayerPoolProfile" WHERE "id" = ${existingProfile.id}
      `
    : [];
  const nextStatus =
    currentStatusRows[0]?.status === PLAYER_POOL_PROFILE_STATUSES.AVAILABLE
      ? PLAYER_POOL_PROFILE_STATUSES.AVAILABLE
      : PLAYER_POOL_PROFILE_STATUSES.INVITED;

  await prisma.$executeRaw`
    INSERT INTO "PlayerPoolProfile" (
      "id", "prospectId", "leadId", "profileToken", "publicCode",
      "emailNormalized", "area", "leagueId", "status",
      "invitedAt", "createdAt", "updatedAt"
    ) VALUES (
      ${profileId}, ${prospectId}, ${lead.id}, ${profileToken}, ${publicCode},
      ${email}, ${lead.area}, ${lead.leagueId}, ${nextStatus},
      NOW(), NOW(), NOW()
    )
    ON CONFLICT ("prospectId") DO UPDATE SET
      "leadId" = EXCLUDED."leadId",
      "emailNormalized" = EXCLUDED."emailNormalized",
      "area" = COALESCE(EXCLUDED."area", "PlayerPoolProfile"."area"),
      "leagueId" = COALESCE(EXCLUDED."leagueId", "PlayerPoolProfile"."leagueId"),
      "invitedAt" = NOW(),
      "updatedAt" = NOW()
  `;

  const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profileToken}`;
  const displayName = lead.contactName?.trim() || fullName(firstName, lastName) || email;
  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `player-pool-profile:${profileId}`,
    audience: NotificationAudience.PLAYER,
    displayName,
    email,
    phone: lead.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: false,
    marketingSmsOptIn: false,
    metadata: {
      entityType: "PLAYER_POOL_PROFILE",
      profileId,
      prospectId,
      leadId: lead.id,
      publicCode,
      leagueId: lead.leagueId,
    },
  });

  const dispatch = await queueNotificationFromTemplate({
    templateKey: PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables: {
      firstName: firstName || "there",
      fullName: displayName,
      profileUrl,
      publicCode,
      area: lead.area || "",
      leagueName: lead.league?.name || "SIXFL PlayerPool",
    },
    sourceType: "PLAYER_POOL_PROFILE_INVITE",
    sourceId: profileId,
    metadata: {
      origin: "player_pool_profile_invite",
      originLabel: "PlayerPool profile invitation email",
      profileId,
      prospectId,
      leadId: lead.id,
      publicCode,
      leagueId: lead.leagueId,
      ctaUrl: profileUrl,
    },
    createdByUserId: user?.id ?? null,
  });

  await logNotificationDispatchToThread({ dispatch, recipient });

  revalidatePath("/admin/player-pool");
  revalidatePath("/admin/templates");
  revalidatePath("/admin/messaging");
  redirect(adminPath("?saved=invite-sent"));
}

export async function introducePlayerPoolRequestAction(formData: FormData) {
  await requireAdmin();
  await ensurePlayerPoolTables();

  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!requestId) redirect(adminPath("?error=Introduction%20request%20not%20found."));

  const rows = await prisma.$queryRaw<IntroductionRow[]>`
    SELECT
      request."id" AS "requestId",
      profile."id" AS "profileId",
      profile."publicCode",
      profile."status" AS "profileStatus",
      prospect."firstName",
      prospect."lastName",
      prospect."email",
      prospect."phone",
      prospect."ageBand",
      prospect."preferredPositions",
      profile."preferredPosition",
      prospect."experienceSummary",
      prospect."availabilityLevel",
      prospect."preferredNights",
      prospect."availabilitySummary",
      profile."area",
      team."id" AS "teamId",
      team."name" AS "teamName",
      team."contactName" AS "teamContactName",
      team."contactEmail" AS "teamContactEmail",
      team."contactPhone" AS "teamContactPhone",
      requester."name" AS "requesterName",
      requester."email" AS "requesterEmail"
    FROM "PlayerPoolIntroductionRequest" request
    JOIN "PlayerPoolProfile" profile ON profile."id" = request."profileId"
    JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
    JOIN "Team" team ON team."id" = request."teamId"
    LEFT JOIN "User" requester ON requester."id" = request."requestedByUserId"
    WHERE request."id" = ${requestId}
      AND request."status" = ${PLAYER_POOL_REQUEST_STATUSES.REQUESTED}
    LIMIT 1
  `;

  const item = rows[0];
  if (!item) redirect(adminPath("?error=Open%20introduction%20request%20not%20found."));

  const playerEmail = item.email?.trim().toLowerCase() || "";
  const captainEmail = item.requesterEmail?.trim().toLowerCase() || item.teamContactEmail?.trim().toLowerCase() || "";
  const playerName = fullName(item.firstName, item.lastName);
  const captainName = item.requesterName?.trim() || item.teamContactName?.trim() || "Captain";

  if (!playerEmail || !captainEmail) {
    redirect(adminPath("?error=Both%20the%20player%20and%20team%20need%20an%20email%20address%20before%20an%20introduction."));
  }

  await sendEmail({
    to: captainEmail,
    subject: `SIXFL PlayerPool introduction — ${item.publicCode}`,
    text: `Hi ${captainName},\n\n${playerName} has agreed to be introduced to ${item.teamName}.\n\nPlayer email: ${playerEmail}\nPlayer mobile: ${item.phone || "Not provided"}\nPositions: ${item.preferredPositions || "Not provided"}\nPreferred position: ${item.preferredPosition || "No preference"}\nExperience: ${item.experienceSummary || "Not provided"}\nAvailability: ${item.availabilityLevel || "Not provided"}\nPreferred nights: ${formatNights(item.preferredNights)}\n\nPlease contact the player respectfully and let SIXFL know if they join your squad.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2>SIXFL PlayerPool introduction</h2>
        <p>Hi ${captainName},</p>
        <p><strong>${playerName}</strong> has agreed to be introduced to <strong>${item.teamName}</strong>.</p>
        <ul>
          <li>Email: ${playerEmail}</li>
          <li>Mobile: ${item.phone || "Not provided"}</li>
          <li>Positions: ${item.preferredPositions || "Not provided"}</li>
          <li>Preferred position: ${item.preferredPosition || "No preference"}</li>
          <li>Experience: ${item.experienceSummary || "Not provided"}</li>
          <li>Availability: ${item.availabilityLevel || "Not provided"}</li>
          <li>Preferred nights: ${formatNights(item.preferredNights)}</li>
        </ul>
        <p>Please contact the player respectfully and let SIXFL know if they join your squad.</p>
      </div>
    `,
  });

  await sendEmail({
    to: playerEmail,
    subject: `Your SIXFL introduction to ${item.teamName}`,
    text: `Hi ${item.firstName},\n\nSIXFL has introduced you to ${item.teamName}.\n\nCaptain/contact: ${captainName}\nEmail: ${captainEmail}\nMobile: ${item.teamContactPhone || "Not provided"}\n\nThe team may now contact you about playing or arranging a trial. You are not committed to join and can contact SIXFL if anything does not feel right.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2>Your SIXFL PlayerPool introduction</h2>
        <p>Hi ${item.firstName},</p>
        <p>SIXFL has introduced you to <strong>${item.teamName}</strong>.</p>
        <ul>
          <li>Captain/contact: ${captainName}</li>
          <li>Email: ${captainEmail}</li>
          <li>Mobile: ${item.teamContactPhone || "Not provided"}</li>
        </ul>
        <p>The team may now contact you about playing or arranging a trial. You are not committed to join.</p>
      </div>
    `,
  });

  const existingTeamProspect = await prisma.teamPlayerProspect.findFirst({
    where: {
      teamId: item.teamId,
      email: { equals: playerEmail, mode: "insensitive" },
    },
    select: { id: true },
  });

  if (!existingTeamProspect) {
    await prisma.teamPlayerProspect.create({
      data: {
        teamId: item.teamId,
        firstName: item.firstName,
        lastName: item.lastName,
        email: playerEmail,
        phone: item.phone,
        ageBand: item.ageBand,
        preferredPositions: item.preferredPositions,
        experienceSummary: item.experienceSummary,
        availabilityLevel: item.availabilityLevel,
        preferredNights: Array.isArray(item.preferredNights)
          ? (item.preferredNights as Prisma.InputJsonValue)
          : undefined,
        availabilitySummary: item.availabilitySummary,
        source: `SIXFL PlayerPool ${item.publicCode}`,
        status: "TRIAL",
        notes: `Introduced through SIXFL PlayerPool (${item.publicCode}).`,
      },
    });
  }

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "PlayerPoolIntroductionRequest"
      SET "status" = ${PLAYER_POOL_REQUEST_STATUSES.INTRODUCED},
          "introducedAt" = NOW(),
          "resolvedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "id" = ${requestId}
    `,
    prisma.$executeRaw`
      UPDATE "PlayerPoolProfile"
      SET "status" = ${PLAYER_POOL_PROFILE_STATUSES.TRIAL_ARRANGED},
          "updatedAt" = NOW()
      WHERE "id" = ${item.profileId}
    `,
  ]);

  revalidatePath("/admin/player-pool");
  revalidatePath(`/captain/team/${item.teamId}/player-pool`);
  revalidatePath(`/captain/team/${item.teamId}/prospects`);
  redirect(adminPath("?saved=introduced"));
}

export async function returnPlayerPoolProfileAction(formData: FormData) {
  await requireAdmin();
  await ensurePlayerPoolTables();

  const profileId = String(formData.get("profileId") ?? "").trim();
  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!profileId) redirect(adminPath("?error=PlayerPool%20profile%20not%20found."));

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "PlayerPoolProfile"
      SET "status" = ${PLAYER_POOL_PROFILE_STATUSES.AVAILABLE},
          "updatedAt" = NOW()
      WHERE "id" = ${profileId}
    `,
    ...(requestId
      ? [
          prisma.$executeRaw`
            UPDATE "PlayerPoolIntroductionRequest"
            SET "status" = ${PLAYER_POOL_REQUEST_STATUSES.CLOSED},
                "resolvedAt" = NOW(),
                "updatedAt" = NOW()
            WHERE "id" = ${requestId}
          `,
        ]
      : []),
  ]);

  revalidatePath("/admin/player-pool");
  redirect(adminPath("?saved=returned"));
}

export async function setPlayerPoolProfileStatusAction(formData: FormData) {
  await requireAdmin();
  await ensurePlayerPoolTables();

  const profileId = String(formData.get("profileId") ?? "").trim();
  const requestedStatus = String(formData.get("status") ?? "").trim().toUpperCase();
  const allowed = [
    PLAYER_POOL_PROFILE_STATUSES.AVAILABLE,
    PLAYER_POOL_PROFILE_STATUSES.PAUSED,
    PLAYER_POOL_PROFILE_STATUSES.JOINED,
    PLAYER_POOL_PROFILE_STATUSES.NOT_LOOKING,
  ];
  const status = allowed.includes(requestedStatus as (typeof allowed)[number])
    ? requestedStatus
    : PLAYER_POOL_PROFILE_STATUSES.PAUSED;

  if (!profileId) redirect(adminPath("?error=PlayerPool%20profile%20not%20found."));

  await prisma.$executeRaw`
    UPDATE "PlayerPoolProfile"
    SET "status" = ${status}, "updatedAt" = NOW()
    WHERE "id" = ${profileId}
  `;

  revalidatePath("/admin/player-pool");
  redirect(adminPath("?saved=status-updated"));
}
