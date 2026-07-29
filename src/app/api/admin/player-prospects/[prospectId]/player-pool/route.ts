// ========================================
// File: src/app/api/admin/player-prospects/[prospectId]/player-pool/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
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
import { requireAdmin } from "@/lib/requireAdmin";

const PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY =
  "player-pool-profile-invite-email";
const PLAYER_POOL_LOGO_PATH = "/logos/sixfl player pool .png";

type ExistingProfileRow = {
  id: string;
  prospectId: string;
  profileToken: string;
  publicCode: string;
  status: string;
};

type RequestBody = {
  leagueId?: unknown;
};

function cleanString(value: unknown) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function getDisplayName(input: {
  firstName: string;
  lastName: string | null;
  email: string;
}) {
  return (
    [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
    input.email
  );
}

function extractArea(notes: string | null) {
  if (!notes) return null;
  const match = notes.match(/(?:^|\n)Area:\s*([^\n]+)/i);
  return match?.[1]?.trim() || null;
}

function buildPlayerPoolSource(source: string | null) {
  const existing = source?.trim() || "";
  if (/SIXFL PlayerPool/i.test(existing)) return existing;
  return ["SIXFL PlayerPool", existing || null]
    .filter((value): value is string => Boolean(value))
    .join(" • ");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  const { user } = await requireAdmin();
  await ensurePlayerPoolTables();

  const { prospectId } = await params;
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const requestedLeagueId = cleanString(body?.leagueId);

  try {
    const prospect = await prisma.teamPlayerProspect.findUnique({
      where: { id: prospectId },
      select: {
        id: true,
        teamId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        preferredPositions: true,
        source: true,
        status: true,
        notes: true,
      },
    });

    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
    }

    if (prospect.teamId || prospect.status === "ACTIVE_SQUAD") {
      return NextResponse.json(
        { error: "Only an unassigned prospect can be sent to PlayerPool." },
        { status: 400 },
      );
    }

    if (prospect.status === "DECLINED" || prospect.status === "DUPLICATE") {
      return NextResponse.json(
        { error: "This prospect is closed and cannot be sent to PlayerPool." },
        { status: 400 },
      );
    }

    if (!prospect.email?.trim()) {
      return NextResponse.json(
        { error: "Add an email address before sending this player to PlayerPool." },
        { status: 400 },
      );
    }

    const email = normalizePlayerPoolEmail(prospect.email);
    const league = requestedLeagueId
      ? await prisma.league.findUnique({
          where: { id: requestedLeagueId },
          select: { id: true, name: true, area: true },
        })
      : null;

    if (requestedLeagueId && !league) {
      return NextResponse.json(
        { error: "The selected league could not be found." },
        { status: 400 },
      );
    }

    const existingRows = await prisma.$queryRaw<ExistingProfileRow[]>`
      SELECT "id", "prospectId", "profileToken", "publicCode", "status"
      FROM "PlayerPoolProfile"
      WHERE "prospectId" = ${prospect.id}
         OR "emailNormalized" = ${email}
      ORDER BY CASE WHEN "prospectId" = ${prospect.id} THEN 0 ELSE 1 END
      LIMIT 1
    `;
    const existingProfile = existingRows[0] ?? null;

    if (existingProfile && existingProfile.prospectId !== prospect.id) {
      return NextResponse.json(
        {
          error:
            "This email is already linked to another PlayerPool prospect. Remove or merge the duplicate first.",
        },
        { status: 409 },
      );
    }

    const profileId = existingProfile?.id ?? createPlayerPoolId();
    const profileToken =
      existingProfile?.profileToken ?? createPlayerPoolToken();
    const publicCode =
      existingProfile?.publicCode ?? createPlayerPoolPublicCode();
    const nextProfileStatus =
      existingProfile?.status === PLAYER_POOL_PROFILE_STATUSES.AVAILABLE
        ? PLAYER_POOL_PROFILE_STATUSES.AVAILABLE
        : PLAYER_POOL_PROFILE_STATUSES.INVITED;
    const area = league?.area?.trim() || extractArea(prospect.notes);
    const invitedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.teamPlayerProspect.update({
        where: { id: prospect.id },
        data: {
          teamId: null,
          source: buildPlayerPoolSource(prospect.source),
          status:
            nextProfileStatus === PLAYER_POOL_PROFILE_STATUSES.AVAILABLE
              ? prospect.status
              : PLAYER_POOL_PROFILE_STATUSES.INVITED,
          lastContactedAt: invitedAt,
        },
      });

      await tx.$executeRaw`
        INSERT INTO "PlayerPoolProfile" (
          "id", "prospectId", "leadId", "profileToken", "publicCode",
          "emailNormalized", "area", "leagueId", "preferredPosition",
          "status", "invitedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${profileId}, ${prospect.id}, NULL, ${profileToken}, ${publicCode},
          ${email}, ${area}, ${league?.id ?? null}, ${prospect.preferredPositions},
          ${nextProfileStatus}, ${invitedAt}, NOW(), NOW()
        )
        ON CONFLICT ("prospectId") DO UPDATE SET
          "emailNormalized" = EXCLUDED."emailNormalized",
          "area" = COALESCE(EXCLUDED."area", "PlayerPoolProfile"."area"),
          "leagueId" = COALESCE(EXCLUDED."leagueId", "PlayerPoolProfile"."leagueId"),
          "preferredPosition" = COALESCE(
            EXCLUDED."preferredPosition",
            "PlayerPoolProfile"."preferredPosition"
          ),
          "status" = CASE
            WHEN "PlayerPoolProfile"."status" = ${PLAYER_POOL_PROFILE_STATUSES.AVAILABLE}
              THEN "PlayerPoolProfile"."status"
            ELSE ${PLAYER_POOL_PROFILE_STATUSES.INVITED}
          END,
          "invitedAt" = EXCLUDED."invitedAt",
          "updatedAt" = NOW()
      `;
    });

    const displayName = getDisplayName({
      firstName: prospect.firstName,
      lastName: prospect.lastName,
      email,
    });
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
        prospectId: prospect.id,
        publicCode,
        leagueId: league?.id ?? null,
      },
    });

    const dispatch = await queueNotificationFromTemplate({
      templateKey: PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY,
      recipientId: recipient.id,
      variables: {
        firstName: prospect.firstName?.trim() || "there",
        fullName: displayName,
        profileUrl,
        publicCode,
        area: area || "",
        leagueName: league?.name || "SIXFL PlayerPool",
      },
      emailBranding: {
        teamName: "SIXFL PlayerPool",
        teamLogoUrl: PLAYER_POOL_LOGO_PATH,
        leagueName: "Private player matching",
      },
      sourceType: "PLAYER_POOL_PROFILE_INVITE",
      sourceId: profileId,
      metadata: {
        origin: "prospect_to_player_pool",
        originLabel: "Prospect sent to PlayerPool and invitation queued",
        profileId,
        prospectId: prospect.id,
        publicCode,
        leagueId: league?.id ?? null,
        ctaUrl: profileUrl,
      },
      createdByUserId: user?.id ?? null,
    });

    await logNotificationDispatchToThread({ dispatch, recipient });

    revalidatePath("/admin/player-prospects");
    revalidatePath(`/admin/player-prospects/${prospect.id}/communications`);
    revalidatePath("/admin/player-pool");
    revalidatePath("/admin/messaging");

    return NextResponse.json({
      ok: true,
      profileId,
      publicCode,
      message:
        nextProfileStatus === PLAYER_POOL_PROFILE_STATUSES.AVAILABLE
          ? "PlayerPool invitation resent. The existing available profile was preserved."
          : "Player added to PlayerPool and profile invitation queued.",
    });
  } catch (error) {
    console.error("Prospect to PlayerPool failed", { prospectId, error });
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "The player could not be sent to PlayerPool.",
      },
      { status: 500 },
    );
  }
}
