import { randomBytes, randomUUID } from "node:crypto";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { TEAM_KIT_QUANTITY } from "@/lib/kits/constants";
import {
  listAssignableKitMembers,
  listKitPlayerAssignments,
} from "@/lib/kits/player-assignments";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function validPosition(value: unknown) {
  const position = Number(value);
  return Number.isInteger(position) && position >= 1 && position <= TEAM_KIT_QUANTITY
    ? position
    : null;
}

async function responsePayload(teamId: string) {
  const [members, assignments] = await Promise.all([
    listAssignableKitMembers(teamId),
    listKitPlayerAssignments(teamId),
  ]);

  return {
    members,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      sentAt: assignment.sentAt?.toISOString() ?? null,
      lastSentAt: assignment.lastSentAt?.toISOString() ?? null,
      openedAt: assignment.openedAt?.toISOString() ?? null,
      completedAt: assignment.completedAt?.toISOString() ?? null,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
      dispatchSentAt: assignment.dispatchSentAt?.toISOString() ?? null,
    })),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  return NextResponse.json(await responsePayload(teamid));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  const body = (await request.json().catch(() => null)) as
    | {
        action?: string;
        position?: unknown;
        teamMemberId?: string;
      }
    | null;

  const action = body?.action?.trim();
  const position = validPosition(body?.position);

  if (!action || !position) {
    return jsonError("Choose a valid kit slot.");
  }

  if (action === "clear") {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "TeamKitPlayerAssignment"
      WHERE "teamId" = ${teamid}
        AND "position" = ${position}
    `);
    return NextResponse.json(await responsePayload(teamid));
  }

  if (action !== "assign" && action !== "resend") {
    return jsonError("Unknown assignment action.");
  }

  const teamMemberId = body?.teamMemberId?.trim();
  if (!teamMemberId) return jsonError("Choose a squad member.");

  const [team, member, existingRows] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: { id: true, name: true },
    }),
    prisma.teamMember.findFirst({
      where: { id: teamMemberId, teamId: teamid },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.$queryRaw<
      Array<{
        id: string;
        teamMemberId: string;
        token: string;
        status: string;
      }>
    >(Prisma.sql`
      SELECT "id", "teamMemberId", "token", "status"
      FROM "TeamKitPlayerAssignment"
      WHERE "teamId" = ${teamid}
        AND "position" = ${position}
      LIMIT 1
    `),
  ]);

  if (!team || !member) return jsonError("That squad member could not be found.", 404);
  const email = member.user.email?.trim().toLowerCase() || null;
  if (!email) {
    return jsonError("Add an email address to this squad member before sending a kit link.");
  }

  const existing = existingRows[0] ?? null;
  const changingPlayer = Boolean(existing && existing.teamMemberId !== member.id);
  const assignmentId = existing?.id ?? randomUUID();
  const token = existing && !changingPlayer
    ? existing.token
    : randomBytes(32).toString("hex");
  const now = new Date();

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "TeamKitPlayerAssignment" (
      "id",
      "teamId",
      "teamMemberId",
      "position",
      "token",
      "status",
      "sentAt",
      "lastSentAt",
      "createdByUserId",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${assignmentId},
      ${teamid},
      ${member.id},
      ${position},
      ${token},
      'SENT',
      ${now},
      ${now},
      ${access.user?.id ?? null},
      ${now},
      ${now}
    )
    ON CONFLICT ("teamId", "position") DO UPDATE SET
      "teamMemberId" = EXCLUDED."teamMemberId",
      "token" = EXCLUDED."token",
      "status" = CASE
        WHEN "TeamKitPlayerAssignment"."status" = 'COMPLETED'
          AND "TeamKitPlayerAssignment"."teamMemberId" = EXCLUDED."teamMemberId"
          THEN 'COMPLETED'
        ELSE 'SENT'
      END,
      "backName" = CASE
        WHEN "TeamKitPlayerAssignment"."teamMemberId" = EXCLUDED."teamMemberId"
          THEN "TeamKitPlayerAssignment"."backName"
        ELSE NULL
      END,
      "shirtNumber" = CASE
        WHEN "TeamKitPlayerAssignment"."teamMemberId" = EXCLUDED."teamMemberId"
          THEN "TeamKitPlayerAssignment"."shirtNumber"
        ELSE NULL
      END,
      "kitSize" = CASE
        WHEN "TeamKitPlayerAssignment"."teamMemberId" = EXCLUDED."teamMemberId"
          THEN "TeamKitPlayerAssignment"."kitSize"
        ELSE NULL
      END,
      "sentAt" = COALESCE("TeamKitPlayerAssignment"."sentAt", EXCLUDED."sentAt"),
      "lastSentAt" = EXCLUDED."lastSentAt",
      "openedAt" = CASE
        WHEN "TeamKitPlayerAssignment"."teamMemberId" = EXCLUDED."teamMemberId"
          THEN "TeamKitPlayerAssignment"."openedAt"
        ELSE NULL
      END,
      "completedAt" = CASE
        WHEN "TeamKitPlayerAssignment"."teamMemberId" = EXCLUDED."teamMemberId"
          THEN "TeamKitPlayerAssignment"."completedAt"
        ELSE NULL
      END,
      "createdByUserId" = EXCLUDED."createdByUserId",
      "updatedAt" = EXCLUDED."updatedAt"
  `);

  const playerName = member.user.name?.trim() || email;
  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.USER,
    sourceId: member.userId,
    audience: NotificationAudience.USER,
    displayName: playerName,
    email,
    transactionalEmailOptIn: true,
    metadata: {
      teamId: team.id,
      teamName: team.name,
      kitAssignmentId: assignmentId,
      kitPosition: position,
    },
  });

  const link = new URL(`/kit-details/${token}`, `${getPublicSiteUrl()}/`).toString();
  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.USER,
    subject: `${team.name}: complete your SIXFL kit details`,
    body: [
      `Hi ${playerName},`,
      "",
      `${team.name} has assigned kit ${position} to you. Please choose your kit size, shirt number and the name you want printed on the back.`,
      "",
      "Use the secure link below to complete your details. Shirt numbers must be unique within the team order.",
    ].join("\n"),
    emailCta: {
      label: "Complete my kit details",
      url: link,
    },
    sourceType: "TEAM_KIT_PLAYER_ASSIGNMENT",
    sourceId: assignmentId,
    metadata: {
      teamId: team.id,
      teamName: team.name,
      teamMemberId: member.id,
      kitPosition: position,
      assignmentToken: token,
    },
    createdByUserId: access.user?.id ?? null,
  });

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "TeamKitPlayerAssignment"
    SET
      "lastDispatchId" = ${dispatch.id},
      "lastSentAt" = ${now},
      "updatedAt" = NOW()
    WHERE "id" = ${assignmentId}
  `);

  return NextResponse.json(await responsePayload(teamid));
}
