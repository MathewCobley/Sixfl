// ========================================
// File: src/app/captain/team/[teamid]/player-pool/actions.ts
// ========================================

"use server";

import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { sendEmail } from "@/lib/email";
import {
  PLAYER_POOL_PROFILE_STATUSES,
  PLAYER_POOL_REQUEST_STATUSES,
  createPlayerPoolId,
  ensurePlayerPoolTables,
  getPlayerPoolBaseUrl,
} from "@/lib/player-pool/storage";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

type PlayerPoolRequestProfile = {
  profileId: string;
  publicCode: string;
  status: string;
  consentShareProfile: boolean;
  consentContact: boolean;
  firstName: string;
  email: string | null;
  teamName: string;
  teamContactEmail: string | null;
};

type ApprovedPlayerPoolProspect = {
  requestId: string;
  profileId: string;
  prospectId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  teamName: string;
  teamLogoUrl: string | null;
  joinSlug: string | null;
  leagueName: string | null;
};

function pagePath(teamid: string, query = "") {
  return `/captain/team/${teamid}/player-pool${query}`;
}

function playerDisplayName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || "Player";
}

async function queuePlayerPoolSquadActivation(input: {
  teamId: string;
  createdByUserId: string | null;
  player: ApprovedPlayerPoolProspect;
}) {
  const email = input.player.email?.trim().toLowerCase();
  if (!email) return;

  const displayName = playerDisplayName(input.player);
  const activationUrl = input.player.joinSlug
    ? `${getPlayerPoolBaseUrl()}/teams/join/${input.player.joinSlug}`
    : `${getPlayerPoolBaseUrl()}/login`;

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `team-prospect:${input.player.prospectId}`,
    audience: NotificationAudience.PLAYER,
    displayName,
    email,
    phone: input.player.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: false,
    marketingSmsOptIn: false,
    metadata: {
      entityType: "TEAM_PLAYER_PROSPECT",
      teamId: input.teamId,
      prospectId: input.player.prospectId,
      playerPoolProfileId: input.player.profileId,
      playerPoolRequestId: input.player.requestId,
    },
  });

  const body = `Hi ${input.player.firstName || "there"},

You’re joining ${input.player.teamName} through SIXFL PlayerPool.

Your squad place is ready. Complete your SIXFL squad signup using the same email address (${email}) so your player profile can be activated and linked to the team.

{{cta}}

If you have already activated your SIXFL account with this email address, there is nothing else you need to do.

Thanks,
SIXFL`;

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.PLAYER,
    subject: `Your place in the ${input.player.teamName} squad`,
    body,
    isTransactional: true,
    sourceType: "TEAM_PLAYER_PROSPECT",
    sourceId: input.player.prospectId,
    emailBranding: {
      teamName: input.player.teamName,
      teamLogoUrl: input.player.teamLogoUrl,
      leagueName: input.player.leagueName,
    },
    emailCta: {
      label: "Activate your squad place",
      url: activationUrl,
    },
    metadata: {
      origin: "player_pool_squad_activation",
      originLabel: "PlayerPool player added to squad",
      teamId: input.teamId,
      prospectId: input.player.prospectId,
      playerPoolProfileId: input.player.profileId,
      playerPoolRequestId: input.player.requestId,
    },
    createdByUserId: input.createdByUserId,
  });

  await logNotificationDispatchToThread({ dispatch, recipient });
}

export async function requestPlayerPoolIntroductionAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const profileId = String(formData.get("profileId") ?? "").trim();
  const captainMessage = String(formData.get("captainMessage") ?? "").trim().slice(0, 500) || null;

  const access = await requireCaptain(teamid);
  await ensurePlayerPoolTables();

  if (!teamid || !profileId) {
    redirect("/captain");
  }

  const rows = await prisma.$queryRaw<PlayerPoolRequestProfile[]>`
    SELECT
      profile."id" AS "profileId",
      profile."publicCode",
      profile."status",
      profile."consentShareProfile",
      profile."consentContact",
      prospect."firstName",
      prospect."email",
      team."name" AS "teamName",
      team."contactEmail" AS "teamContactEmail"
    FROM "PlayerPoolProfile" profile
    JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
    CROSS JOIN "Team" team
    WHERE profile."id" = ${profileId}
      AND team."id" = ${teamid}
      AND NOT EXISTS (
        SELECT 1
        FROM "TeamPlayerProspect" squad_prospect
        WHERE squad_prospect."teamId" = ${teamid}
          AND squad_prospect."email" IS NOT NULL
          AND prospect."email" IS NOT NULL
          AND LOWER(TRIM(squad_prospect."email")) = LOWER(TRIM(prospect."email"))
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "TeamMember" squad_member
        JOIN "User" squad_user ON squad_user."id" = squad_member."userId"
        WHERE squad_member."teamId" = ${teamid}
          AND squad_user."email" IS NOT NULL
          AND prospect."email" IS NOT NULL
          AND LOWER(TRIM(squad_user."email")) = LOWER(TRIM(prospect."email"))
      )
    LIMIT 1
  `;

  const profile = rows[0];

  if (!profile || !profile.consentShareProfile || !profile.consentContact) {
    redirect(pagePath(teamid, "?error=That%20player%20is%20not%20currently%20available%20for%20introductions."));
  }

  if (
    profile.status !== PLAYER_POOL_PROFILE_STATUSES.AVAILABLE &&
    profile.status !== PLAYER_POOL_PROFILE_STATUSES.INTRODUCTION_REQUESTED
  ) {
    redirect(pagePath(teamid, "?error=That%20player%20is%20no%20longer%20available."));
  }

  const existing = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id", "status"
    FROM "PlayerPoolIntroductionRequest"
    WHERE "profileId" = ${profileId}
      AND "teamId" = ${teamid}
    LIMIT 1
  `;

  if (existing[0]?.status === PLAYER_POOL_REQUEST_STATUSES.REQUESTED) {
    redirect(pagePath(teamid, "?saved=request-already-sent"));
  }

  const requestId = existing[0]?.id ?? createPlayerPoolId();

  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO "PlayerPoolIntroductionRequest" (
        "id", "profileId", "teamId", "requestedByUserId", "captainMessage",
        "status", "requestedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${requestId}, ${profileId}, ${teamid}, ${access.user?.id ?? null}, ${captainMessage},
        ${PLAYER_POOL_REQUEST_STATUSES.REQUESTED}, NOW(), NOW(), NOW()
      )
      ON CONFLICT ("profileId", "teamId") DO UPDATE SET
        "requestedByUserId" = EXCLUDED."requestedByUserId",
        "captainMessage" = EXCLUDED."captainMessage",
        "status" = ${PLAYER_POOL_REQUEST_STATUSES.REQUESTED},
        "requestedAt" = NOW(),
        "introducedAt" = NULL,
        "resolvedAt" = NULL,
        "updatedAt" = NOW()
    `,
    prisma.$executeRaw`
      UPDATE "PlayerPoolProfile"
      SET "status" = ${PLAYER_POOL_PROFILE_STATUSES.INTRODUCTION_REQUESTED},
          "updatedAt" = NOW()
      WHERE "id" = ${profileId}
    `,
  ]);

  const captainName = access.user?.name?.trim() || access.user?.email?.trim() || "A SIXFL captain";
  const captainEmail = access.user?.email?.trim() || profile.teamContactEmail?.trim() || "Not available";

  try {
    await sendEmail({
      to: "hello@sixfl.co.uk",
      subject: `PlayerPool introduction request — ${profile.teamName} / ${profile.publicCode}`,
      text: `${captainName} from ${profile.teamName} has requested an introduction to ${profile.publicCode}.\n\nCaptain email: ${captainEmail}\nMessage: ${captainMessage || "No message"}\n\nReview: https://www.sixfl.co.uk/admin/player-pool`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2>SIXFL PlayerPool introduction request</h2>
          <p><strong>${profile.teamName}</strong> has requested an introduction to <strong>${profile.publicCode}</strong>.</p>
          <p>Captain: ${captainName}<br>Email: ${captainEmail}</p>
          <p>Message: ${captainMessage || "No message"}</p>
          <p><a href="https://www.sixfl.co.uk/admin/player-pool">Review in PlayerPool admin</a></p>
        </div>
      `,
    });
  } catch (error) {
    console.error("PlayerPool admin request email failed:", error);
  }

  if (profile.email?.trim()) {
    try {
      await sendEmail({
        to: profile.email,
        subject: "A SIXFL team is interested in your PlayerPool profile",
        text: `Hi ${profile.firstName},\n\nA SIXFL team has asked to be introduced to you through PlayerPool. Your contact details have not been shared. SIXFL will contact you before arranging any introduction.\n\nSIXFL\n6-a-side. Done properly.`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>A team is interested in your PlayerPool profile</h2>
            <p>Hi ${profile.firstName},</p>
            <p>A SIXFL team has asked to be introduced to you through PlayerPool.</p>
            <p><strong>Your contact details have not been shared.</strong> SIXFL will contact you before arranging any introduction.</p>
            <p>SIXFL<br>6-a-side. Done properly.</p>
          </div>
        `,
      });
    } catch (error) {
      console.error("PlayerPool player request email failed:", error);
    }
  }

  revalidatePath(pagePath(teamid));
  revalidatePath("/admin/player-pool");
  redirect(pagePath(teamid, "?saved=request-sent"));
}

export async function addPlayerPoolPlayerToSquadAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const profileId = String(formData.get("profileId") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  const access = await requireCaptain(teamid);
  await ensurePlayerPoolTables();

  if (!teamid || !profileId || !prospectId) {
    redirect(pagePath(teamid, "?error=PlayerPool%20player%20could%20not%20be%20identified."));
  }

  const rows = await prisma.$queryRaw<ApprovedPlayerPoolProspect[]>`
    SELECT
      request."id" AS "requestId",
      profile."id" AS "profileId",
      squad_prospect."id" AS "prospectId",
      squad_prospect."firstName",
      squad_prospect."lastName",
      squad_prospect."email",
      squad_prospect."phone",
      team."name" AS "teamName",
      team."logoUrl" AS "teamLogoUrl",
      team."joinSlug",
      league."name" AS "leagueName"
    FROM "PlayerPoolIntroductionRequest" request
    JOIN "PlayerPoolProfile" profile ON profile."id" = request."profileId"
    JOIN "TeamPlayerProspect" pool_prospect ON pool_prospect."id" = profile."prospectId"
    JOIN "Team" team ON team."id" = request."teamId"
    LEFT JOIN "League" league ON league."id" = team."leagueId"
    JOIN "TeamPlayerProspect" squad_prospect
      ON squad_prospect."id" = ${prospectId}
     AND squad_prospect."teamId" = request."teamId"
     AND squad_prospect."email" IS NOT NULL
     AND pool_prospect."email" IS NOT NULL
     AND LOWER(TRIM(squad_prospect."email")) = LOWER(TRIM(pool_prospect."email"))
    WHERE request."teamId" = ${teamid}
      AND request."profileId" = ${profileId}
      AND request."status" = ${PLAYER_POOL_REQUEST_STATUSES.INTRODUCED}
    LIMIT 1
  `;

  const item = rows[0];
  if (!item) {
    redirect(pagePath(teamid, "?error=This%20PlayerPool%20introduction%20is%20not%20ready%20to%20join%20the%20squad."));
  }

  const normalizedEmail = item.email?.trim().toLowerCase() || null;
  const user = normalizedEmail
    ? await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    if (user) {
      await tx.teamMember.upsert({
        where: {
          userId_teamId: {
            userId: user.id,
            teamId: teamid,
          },
        },
        update: {},
        create: {
          userId: user.id,
          teamId: teamid,
          role: "PLAYER",
        },
      });
    }

    await tx.teamPlayerProspect.update({
      where: { id: item.prospectId },
      data: {
        status: "ACTIVE_SQUAD",
        lastContactedAt: new Date(),
      },
    });

    await tx.$executeRaw`
      UPDATE "PlayerPoolIntroductionRequest"
      SET "status" = ${PLAYER_POOL_REQUEST_STATUSES.JOINED},
          "resolvedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "id" = ${item.requestId}
    `;

    await tx.$executeRaw`
      UPDATE "PlayerPoolProfile"
      SET "status" = ${PLAYER_POOL_PROFILE_STATUSES.JOINED},
          "updatedAt" = NOW()
      WHERE "id" = ${item.profileId}
    `;
  });

  if (!user && item.email?.trim()) {
    try {
      await queuePlayerPoolSquadActivation({
        teamId: teamid,
        createdByUserId: access.user?.id ?? null,
        player: item,
      });
    } catch (error) {
      console.error("PlayerPool squad activation email could not be queued", error);
    }
  }

  revalidatePath(pagePath(teamid));
  revalidatePath(`/captain/team/${teamid}/prospects`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath("/admin/player-pool");
  redirect(pagePath(teamid, "?saved=promoted"));
}
