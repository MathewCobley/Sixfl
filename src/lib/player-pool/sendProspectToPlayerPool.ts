import {
  NotificationAudience,
  NotificationRecipientSourceType,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import {
  PLAYER_POOL_PROFILE_STATUSES,
  createPlayerPoolId,
  createPlayerPoolPublicCode,
  createPlayerPoolToken,
  ensurePlayerPoolTables,
  getPlayerPoolBaseUrl,
  normalizePlayerPoolEmail,
} from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";

const PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY =
  "player-pool-profile-invite-email";

type ExistingProfileRow = {
  id: string;
  prospectId: string;
  profileToken: string;
  publicCode: string;
};

function fullName(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function extractArea(...values: Array<string | null | undefined>) {
  const text = values.filter(Boolean).join(" ");
  const match = text.match(
    /\bArea:\s*(.+?)(?=\s+(?:League type|Preferred nights|Source lead ID|Lead message):|$)/i,
  );

  return match?.[1]?.trim() || null;
}

export async function sendProspectToPlayerPool(input: {
  prospectId: string;
  requestedLeagueId?: string | null;
  createdByUserId?: string | null;
  origin?: string;
  originLabel?: string;
}) {
  await ensurePlayerPoolTables();

  const requestedLeagueId = input.requestedLeagueId?.trim() ?? "";
  const [prospect, requestedLeague] = await Promise.all([
    prisma.teamPlayerProspect.findUnique({
      where: { id: input.prospectId },
      select: {
        id: true,
        teamId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        notes: true,
        availabilitySummary: true,
        team: {
          select: {
            id: true,
            name: true,
            league: {
              select: {
                id: true,
                name: true,
                area: true,
              },
            },
          },
        },
      },
    }),
    requestedLeagueId
      ? prisma.league.findUnique({
          where: { id: requestedLeagueId },
          select: { id: true, name: true, area: true },
        })
      : Promise.resolve(null),
  ]);

  if (!prospect) {
    throw new Error("Prospect not found.");
  }

  if (["DECLINED", "DUPLICATE"].includes(prospect.status)) {
    throw new Error("This record is not currently eligible for PlayerPool.");
  }

  if (!prospect.email?.trim()) {
    throw new Error(
      "Add an email address before sending this player to PlayerPool.",
    );
  }

  const effectiveLeague = requestedLeague ?? prospect.team?.league ?? null;
  const email = normalizePlayerPoolEmail(prospect.email);
  const displayName = fullName(prospect.firstName, prospect.lastName) || email;
  const firstName = prospect.firstName.trim() || "there";
  const area =
    effectiveLeague?.area?.trim() ||
    extractArea(prospect.notes, prospect.availabilitySummary);

  const existingRows = await prisma.$queryRaw<ExistingProfileRow[]>`
    SELECT "id", "prospectId", "profileToken", "publicCode"
    FROM "PlayerPoolProfile"
    WHERE "prospectId" = ${prospect.id}
       OR "emailNormalized" = ${email}
    ORDER BY CASE WHEN "prospectId" = ${prospect.id} THEN 0 ELSE 1 END
    LIMIT 1
  `;
  const existingProfile = existingRows[0] ?? null;

  const profileId = existingProfile?.id ?? createPlayerPoolId();
  const profileToken = existingProfile?.profileToken ?? createPlayerPoolToken();
  const publicCode = existingProfile?.publicCode ?? createPlayerPoolPublicCode();
  const profileProspectId = existingProfile?.prospectId ?? prospect.id;

  if (existingProfile) {
    await prisma.$executeRaw`
      UPDATE "PlayerPoolProfile"
      SET
        "emailNormalized" = ${email},
        "area" = COALESCE("area", ${area}),
        "leagueId" = COALESCE("leagueId", ${effectiveLeague?.id ?? null}),
        "invitedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = ${profileId}
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO "PlayerPoolProfile" (
        "id", "prospectId", "leadId", "profileToken", "publicCode",
        "emailNormalized", "area", "leagueId", "status",
        "invitedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${profileId}, ${prospect.id}, NULL, ${profileToken}, ${publicCode},
        ${email}, ${area}, ${effectiveLeague?.id ?? null}, ${PLAYER_POOL_PROFILE_STATUSES.INVITED},
        NOW(), NOW(), NOW()
      )
    `;
  }

  const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profileToken}`;
  const leagueName = effectiveLeague?.name || "SIXFL PlayerPool";
  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `player-pool-profile:${profileId}`,
    audience: NotificationAudience.PLAYER,
    displayName,
    email,
    phone: prospect.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: false,
    marketingSmsOptIn: false,
    metadata: {
      entityType: "PLAYER_POOL_PROFILE",
      profileId,
      prospectId: profileProspectId,
      requestedProspectId: prospect.id,
      publicCode,
      leagueId: effectiveLeague?.id ?? null,
      currentTeamId: prospect.teamId,
      currentTeamName: prospect.team?.name ?? null,
    },
  });

  const dispatch = await queueNotificationFromTemplate({
    templateKey: PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables: {
      firstName,
      fullName: displayName,
      profileUrl,
      publicCode,
      area: area || "",
      leagueName,
    },
    sourceType: "PLAYER_POOL_PROFILE_INVITE",
    sourceId: profileId,
    metadata: {
      origin: input.origin ?? "player_pool_profile_invite_from_prospect",
      originLabel:
        input.originLabel ??
        "PlayerPool profile invitation sent from player prospects",
      profileId,
      prospectId: profileProspectId,
      requestedProspectId: prospect.id,
      publicCode,
      leagueId: effectiveLeague?.id ?? null,
      currentTeamId: prospect.teamId,
      currentTeamName: prospect.team?.name ?? null,
      ctaUrl: profileUrl,
    },
    createdByUserId: input.createdByUserId ?? null,
  });

  await logNotificationDispatchToThread({ dispatch, recipient });
  await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: {
      lastContactedAt: new Date(),
      status: prospect.status === "NEW" ? "CONTACTED" : undefined,
    },
  });

  return {
    created: !existingProfile,
    profileId,
    prospectId: prospect.id,
    prospectTeamId: prospect.teamId,
    message: existingProfile
      ? `PlayerPool profile form resent.${prospect.teamId ? " Their current squad place has been kept." : ""}`
      : `PlayerPool profile created and form sent.${prospect.teamId ? " Their current squad place has been kept." : ""}`,
  };
}
