import {
  NotificationAudience,
  NotificationRecipientSourceType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

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
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY =
  "player-pool-profile-invite-email";

type ExistingProfileRow = {
  id: string;
  prospectId: string;
  profileToken: string;
  publicCode: string;
};

function routeError(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The player could not be moved to PlayerPool.";
}

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

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ teamid: string; prospectId: string }>;
  },
) {
  const { teamid, prospectId } = await params;

  try {
    const { user } = await requireAdmin();
    await ensurePlayerPoolTables();

    const prospect = await prisma.teamPlayerProspect.findFirst({
      where: {
        id: prospectId,
        teamId: teamid,
        status: "ACTIVE_SQUAD",
      },
      select: {
        id: true,
        teamId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
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
    });

    if (!prospect || !prospect.team) {
      return NextResponse.json(
        { error: "Pending activation player not found for this squad." },
        { status: 404 },
      );
    }

    if (!prospect.email?.trim()) {
      return NextResponse.json(
        { error: "Add an email address before moving this player to PlayerPool." },
        { status: 400 },
      );
    }

    const email = normalizePlayerPoolEmail(prospect.email);
    const displayName = fullName(prospect.firstName, prospect.lastName) || email;
    const firstName = prospect.firstName.trim() || "there";
    const league = prospect.team.league;
    const area =
      league?.area?.trim() ||
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
          "leagueId" = COALESCE("leagueId", ${league?.id ?? null}),
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
          ${email}, ${area}, ${league?.id ?? null}, ${PLAYER_POOL_PROFILE_STATUSES.INVITED},
          NOW(), NOW(), NOW()
        )
      `;
    }

    const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profileToken}`;
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
        leagueId: league?.id ?? null,
        currentTeamId: prospect.team.id,
        currentTeamName: prospect.team.name,
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
        leagueName: league?.name || "SIXFL PlayerPool",
      },
      sourceType: "PLAYER_POOL_PROFILE_INVITE",
      sourceId: profileId,
      metadata: {
        origin: "player_pool_profile_invite_from_pending_activation",
        originLabel:
          "PlayerPool profile invitation sent while moving a pending activation player",
        profileId,
        prospectId: profileProspectId,
        requestedProspectId: prospect.id,
        publicCode,
        leagueId: league?.id ?? null,
        previousTeamId: prospect.team.id,
        previousTeamName: prospect.team.name,
        ctaUrl: profileUrl,
      },
      createdByUserId: user?.id ?? null,
    });

    await logNotificationDispatchToThread({ dispatch, recipient });

    await prisma.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: {
        teamId: null,
        status: "CONTACTED",
        lastContactedAt: new Date(),
      },
    });

    revalidatePath(`/captain/team/${teamid}`);
    revalidatePath(`/captain/team/${teamid}/squad`);
    revalidatePath(`/captain/team/${teamid}/prospects`);
    revalidatePath(`/captain/team/${teamid}/captain-squad`);
    revalidatePath("/admin/player-prospects");
    revalidatePath("/admin/player-pool");
    revalidatePath("/admin/messaging");

    return NextResponse.json({
      ok: true,
      created: !existingProfile,
      profileId,
      publicCode,
      message: existingProfile
        ? "Player moved out of the pending squad and their PlayerPool form was resent."
        : "Player moved out of the pending squad and their PlayerPool form was sent.",
    });
  } catch (error) {
    console.error("Pending activation player could not be moved to PlayerPool", {
      teamid,
      prospectId,
      error,
    });

    return NextResponse.json({ error: routeError(error) }, { status: 500 });
  }
}
