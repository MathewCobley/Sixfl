// ========================================
// File: src/app/captain/team/[teamid]/squad/prospect-details/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

function normaliseNullableString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed ? parsed : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;

  await requireCaptain(teamid);

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 },
    );
  }

  const prospectId = String((body as { prospectId?: unknown }).prospectId ?? "").trim();
  const firstName = String((body as { firstName?: unknown }).firstName ?? "").trim();
  const lastName = normaliseNullableString((body as { lastName?: unknown }).lastName);
  const email = normaliseNullableString((body as { email?: unknown }).email)?.toLowerCase() ?? null;
  const phone = normaliseNullableString((body as { phone?: unknown }).phone);

  if (!prospectId) {
    return NextResponse.json(
      { error: "Prospect not supplied." },
      { status: 400 },
    );
  }

  if (!firstName) {
    return NextResponse.json(
      { error: "First name is required." },
      { status: 400 },
    );
  }

  const existing = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: prospectId,
      teamId: teamid,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Prospect not found." },
      { status: 404 },
    );
  }

  const updated = await prisma.teamPlayerProspect.update({
    where: {
      id: prospectId,
    },
    data: {
      firstName,
      lastName,
      email,
      phone,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      updatedAt: true,
    },
  });

  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/prospects`);

  return NextResponse.json({
    prospect: updated,
  });
}
