// ========================================
// File: src/app/api/captain/team/[teamid]/additional-captains/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { TeamRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { sendDashboardLoginEmail } from "@/lib/auth/sendDashboardLoginEmail";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function cleanEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function isPlausibleEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

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

  return NextResponse.json({
    ok: true,
    teamName: team.name,
    managed: team.teamMode === "MANAGED",
    captains: team.members.map((member) => ({
      membershipId: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
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
  } | null;

  const name = cleanText(body?.name);
  const email = cleanEmail(body?.email);

  if (!teamid?.trim()) {
    return NextResponse.json({ error: "Team not found." }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json(
      { error: "Enter the new captain's name." },
      { status: 400 },
    );
  }

  if (!isPlausibleEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address for the new captain." },
      { status: 400 },
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      teamMode: true,
      captainUserId: true,
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  if (team.teamMode === "MANAGED") {
    return NextResponse.json(
      { error: "SIXFL manages captain access for this team." },
      { status: 403 },
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: { name },
      create: { email, name },
      select: { id: true, name: true, email: true },
    });

    const existingMembership = await tx.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: team.id,
        },
      },
      select: { id: true, role: true },
    });

    const wasAlreadyCaptain = existingMembership?.role === TeamRole.CAPTAIN;

    if (existingMembership) {
      await tx.teamMember.update({
        where: { id: existingMembership.id },
        data: { role: TeamRole.CAPTAIN },
      });
    } else {
      await tx.teamMember.create({
        data: {
          userId: user.id,
          teamId: team.id,
          role: TeamRole.CAPTAIN,
        },
      });
    }

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

    return { user, wasAlreadyCaptain };
  });

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

  revalidatePath(`/captain/team/${team.id}`);
  revalidatePath(`/captain/team/${team.id}/captain-squad`);
  revalidatePath(`/captain/team/${team.id}/squad`);
  revalidatePath(`/admin/teams/${team.id}`);
  revalidatePath(`/admin/teams/${team.id}/squad`);

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
