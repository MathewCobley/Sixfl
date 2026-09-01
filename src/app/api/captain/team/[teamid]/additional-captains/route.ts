// ========================================
// File: src/app/api/captain/team/[teamid]/additional-captains/route.ts
// ========================================

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { TeamRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { sendDashboardLoginEmail } from "@/lib/auth/sendDashboardLoginEmail";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function cleanEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function cleanPhone(value: unknown) {
  return cleanText(value) || null;
}

function isPlausibleEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function saveCaptainPhone(teamMemberId: string, phone: string | null) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TeamMemberProfile" (
      "id" TEXT NOT NULL,
      "teamMemberId" TEXT NOT NULL,
      "phone" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TeamMemberProfile_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "TeamMemberProfile_teamMemberId_key"
    ON "TeamMemberProfile"("teamMemberId");
  `);
  await prisma.$executeRaw`
    INSERT INTO "TeamMemberProfile" ("id", "teamMemberId", "phone", "updatedAt")
    VALUES (${randomUUID()}, ${teamMemberId}, ${phone}, NOW())
    ON CONFLICT ("teamMemberId") DO UPDATE
    SET "phone" = EXCLUDED."phone", "updatedAt" = NOW()
  `;
}

function revalidateTeam(teamId: string) {
  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/captain-squad`);
  revalidatePath(`/captain/team/${teamId}/squad`);
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      teamMode: true,
      members: {
        where: { role: TeamRole.CAPTAIN },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const profiles = await getTeamMemberProfilesByTeamMemberIds(
    team.members.map((member) => member.id),
  );

  return NextResponse.json({
    ok: true,
    teamName: team.name,
    managed: team.teamMode === "MANAGED",
    canManage: access.isAdmin,
    captains: team.members.map((member) => ({
      membershipId: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      phone: profiles.get(member.id)?.phone ?? null,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string;
  } | null;

  const name = cleanText(body?.name);
  const email = cleanEmail(body?.email);
  const phone = cleanPhone(body?.phone);

  if (!teamid?.trim()) {
    return NextResponse.json({ error: "Team not found." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Enter the new captain's name." }, { status: 400 });
  }
  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address for the new captain." }, { status: 400 });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, name: true, teamMode: true, captainUserId: true },
  });

  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if (team.teamMode === "MANAGED") {
    return NextResponse.json({ error: "SIXFL manages captain access for this team." }, { status: 403 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: { name },
      create: { email, name },
      select: { id: true, name: true, email: true },
    });

    const existingMembership = await tx.teamMember.findUnique({
      where: { userId_teamId: { userId: user.id, teamId: team.id } },
      select: { id: true, role: true },
    });

    const wasAlreadyCaptain = existingMembership?.role === TeamRole.CAPTAIN;
    const membership = existingMembership
      ? await tx.teamMember.update({
          where: { id: existingMembership.id },
          data: { role: TeamRole.CAPTAIN },
          select: { id: true },
        })
      : await tx.teamMember.create({
          data: { userId: user.id, teamId: team.id, role: TeamRole.CAPTAIN },
          select: { id: true },
        });

    if (!team.captainUserId) {
      await tx.team.update({
        where: { id: team.id },
        data: {
          captainUserId: user.id,
          captainLinkedAt: new Date(),
          captainLinkedSource: "captain-added-captain",
        },
      });
    }

    return { user, membershipId: membership.id, wasAlreadyCaptain };
  });

  await saveCaptainPhone(result.membershipId, phone);

  let emailSent = true;
  try {
    await sendDashboardLoginEmail({
      email,
      displayName: result.user.name,
      teamName: team.name,
      callbackPath: `/captain/team/${team.id}`,
    });
  } catch (error) {
    emailSent = false;
    console.error("Failed to send additional captain login email", error);
  }

  revalidateTeam(team.id);
  const accessMessage = result.wasAlreadyCaptain
    ? `${name} already had captain access.`
    : `${name} now has captain access.`;

  return NextResponse.json({
    ok: true,
    emailSent,
    message: emailSent
      ? `${accessMessage} A dashboard sign-in email has been sent to ${email}.`
      : `${accessMessage} The sign-in email could not be sent, but they can use the normal SIXFL sign-in page with ${email}.`,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  if (!access.isAdmin) {
    return NextResponse.json({ error: "Only SIXFL admin can edit captain access." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    membershipId?: string;
    name?: string;
    email?: string;
    phone?: string;
  } | null;

  const membershipId = cleanText(body?.membershipId);
  const name = cleanText(body?.name);
  const email = cleanEmail(body?.email);
  const phone = cleanPhone(body?.phone);

  if (!membershipId || !name || !isPlausibleEmail(email)) {
    return NextResponse.json({ error: "Enter a captain name and valid email address." }, { status: 400 });
  }

  const membership = await prisma.teamMember.findFirst({
    where: { id: membershipId, teamId: teamid, role: TeamRole.CAPTAIN },
    select: { id: true, userId: true },
  });
  if (!membership) return NextResponse.json({ error: "Captain not found." }, { status: 404 });

  const emailOwner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (emailOwner && emailOwner.id !== membership.userId) {
    return NextResponse.json({ error: "That email address already belongs to another SIXFL user." }, { status: 409 });
  }

  await prisma.user.update({
    where: { id: membership.userId },
    data: { name, email },
  });
  await saveCaptainPhone(membership.id, phone);
  revalidateTeam(teamid);

  return NextResponse.json({ ok: true, message: "Captain details updated." });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  if (!access.isAdmin) {
    return NextResponse.json({ error: "Only SIXFL admin can remove captain access." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { membershipId?: string } | null;
  const membershipId = cleanText(body?.membershipId);
  if (!membershipId) return NextResponse.json({ error: "Captain not found." }, { status: 400 });

  const captains = await prisma.teamMember.findMany({
    where: { teamId: teamid, role: TeamRole.CAPTAIN },
    select: { id: true, userId: true },
  });
  const target = captains.find((captain) => captain.id === membershipId);
  if (!target) return NextResponse.json({ error: "Captain not found." }, { status: 404 });
  if (captains.length <= 1) {
    return NextResponse.json({ error: "Add another captain before removing the team's final captain." }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMember.update({
      where: { id: membershipId },
      data: { role: TeamRole.PLAYER },
    });

    const team = await tx.team.findUnique({ where: { id: teamid }, select: { captainUserId: true } });
    if (team?.captainUserId === target.userId) {
      const replacement = captains.find((captain) => captain.id !== membershipId);
      await tx.team.update({
        where: { id: teamid },
        data: {
          captainUserId: replacement?.userId ?? null,
          captainLinkedAt: replacement ? new Date() : null,
          captainLinkedSource: replacement ? "admin-captain-reassigned" : null,
        },
      });
    }
  });

  revalidateTeam(teamid);
  return NextResponse.json({ ok: true, message: "Captain access removed. They remain in the squad as a player." });
}
