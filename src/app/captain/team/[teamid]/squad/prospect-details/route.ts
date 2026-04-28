// ========================================
// File: src/app/captain/team/[teamid]/squad/prospect-details/route.ts
// ========================================

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

function normaliseNullableString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed ? parsed : null;
}

async function syncLinkedMemberProfilePhone(input: {
  teamid: string;
  prospectId: string;
  email: string | null;
  phone: string | null;
}) {
  const linkedMemberIds = input.email
    ? await prisma.teamMember.findMany({
        where: {
          teamId: input.teamid,
          user: {
            email: input.email,
          },
        },
        select: {
          id: true,
        },
      })
    : [];

  for (const member of linkedMemberIds) {
    await prisma.$executeRaw`
      INSERT INTO "TeamMemberProfile" (
        "id",
        "teamMemberId",
        "sourceProspectId",
        "phone",
        "updatedAt"
      ) VALUES (
        ${randomUUID()},
        ${member.id},
        ${input.prospectId},
        ${input.phone},
        NOW()
      )
      ON CONFLICT ("teamMemberId") DO UPDATE SET
        "sourceProspectId" = COALESCE("TeamMemberProfile"."sourceProspectId", EXCLUDED."sourceProspectId"),
        "phone" = EXCLUDED."phone",
        "updatedAt" = NOW()
    `;
  }

  await prisma.$executeRaw`
    UPDATE "TeamMemberProfile"
    SET
      "phone" = ${input.phone},
      "updatedAt" = NOW()
    WHERE "sourceProspectId" = ${input.prospectId}
  `;
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

  const updated = await prisma.$transaction(async (tx) => {
    const prospect = await tx.teamPlayerProspect.update({
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

    return prospect;
  });

  await syncLinkedMemberProfilePhone({
    teamid,
    prospectId,
    email,
    phone,
  });

  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/prospects`);
  revalidatePath(`/admin/messages`);
  revalidatePath(`/admin/messaging`);

  return NextResponse.json({
    prospect: updated,
  });
}
