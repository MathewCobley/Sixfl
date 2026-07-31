// ========================================
// File: src/app/api/admin/player-pool/[profileId]/nudge/route.ts
// ========================================

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

type NudgeProfileRow = {
  id: string;
  prospectId: string;
  profileToken: string;
  publicCode: string;
  status: string;
  profileSubmittedAt: Date | null;
  area: string | null;
  leagueId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  leagueName: string | null;
};

function fullName(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function routeError(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The PlayerPool nudge could not be sent.";
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const { profileId } = await params;

  try {
    const { user } = await requireAdmin();
    await ensurePlayerPoolTables();

    const rows = await prisma.$queryRaw<NudgeProfileRow[]>`
      SELECT
        profile."id",
        profile."prospectId",
        profile."profileToken",
        profile."publicCode",
        profile."status",
        profile."profileSubmittedAt",
        profile."area",
        profile."leagueId",
        prospect."firstName",
        prospect."lastName",
        prospect."email",
        prospect."phone",
        league."name" AS "leagueName"
      FROM "PlayerPoolProfile" profile
      JOIN "TeamPlayerProspect" prospect
        ON prospect."id" = profile."prospectId"
      LEFT JOIN "League" league
        ON league."id" = profile."leagueId"
      WHERE profile."id" = ${profileId}
      LIMIT 1
    `;

    const profile = rows[0] ?? null;

    if (!profile) {
      return NextResponse.json(
        { error: "PlayerPool profile not found." },
        { status: 404 },
      );
    }

    if (
      profile.status !== PLAYER_POOL_PROFILE_STATUSES.INVITED ||
      profile.profileSubmittedAt
    ) {
      return NextResponse.json(
        { error: "Only players still awaiting their profile can be nudged." },
        { status: 409 },
      );
    }

    if (!profile.email?.trim()) {
      return NextResponse.json(
        { error: "Add an email address before nudging this player." },
        { status: 400 },
      );
    }

    const email = normalizePlayerPoolEmail(profile.email);
    const displayName =
      fullName(profile.firstName, profile.lastName) || email;
    const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profile.profileToken}`;

    const recipient = await upsertNotificationRecipient({
      sourceType: NotificationRecipientSourceType.GENERAL,
      sourceId: `player-pool-profile:${profile.id}`,
      audience: NotificationAudience.PLAYER,
      displayName,
      email,
      phone: profile.phone,
      transactionalEmailOptIn: true,
      transactionalSmsOptIn: true,
      marketingEmailOptIn: false,
      marketingSmsOptIn: false,
      metadata: {
        entityType: "PLAYER_POOL_PROFILE",
        profileId: profile.id,
        prospectId: profile.prospectId,
        publicCode: profile.publicCode,
        leagueId: profile.leagueId,
      },
    });

    const dispatch = await queueNotificationFromTemplate({
      templateKey: PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY,
      recipientId: recipient.id,
      variables: {
        firstName: profile.firstName.trim() || "there",
        fullName: displayName,
        profileUrl,
        publicCode: profile.publicCode,
        area: profile.area || "",
        leagueName: profile.leagueName || "SIXFL PlayerPool",
      },
      sourceType: "PLAYER_POOL_PROFILE_NUDGE",
      sourceId: profile.id,
      metadata: {
        origin: "player_pool_profile_nudge",
        originLabel: "PlayerPool profile reminder sent from admin",
        profileId: profile.id,
        prospectId: profile.prospectId,
        publicCode: profile.publicCode,
        leagueId: profile.leagueId,
        ctaUrl: profileUrl,
      },
      createdByUserId: user?.id ?? null,
    });

    await logNotificationDispatchToThread({ dispatch, recipient });

    const contactedAt = new Date();
    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "PlayerPoolProfile"
        SET "invitedAt" = ${contactedAt},
            "updatedAt" = ${contactedAt}
        WHERE "id" = ${profile.id}
      `,
      prisma.teamPlayerProspect.update({
        where: { id: profile.prospectId },
        data: { lastContactedAt: contactedAt },
      }),
    ]);

    revalidatePath("/admin/player-pool");
    revalidatePath("/admin/messaging");
    revalidatePath(`/admin/player-prospects/${profile.prospectId}/communications`);

    return NextResponse.json({
      ok: true,
      message: `Nudge sent to ${displayName}.`,
      nudgedAt: contactedAt.toISOString(),
    });
  } catch (error) {
    console.error("PlayerPool nudge failed", error);
    return NextResponse.json({ error: routeError(error) }, { status: 500 });
  }
}
