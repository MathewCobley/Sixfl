// ========================================
// File: src/app/api/admin/player-prospects/[prospectId]/player-pool/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  ensurePlayerPoolTables,
  normalizePlayerPoolEmail,
} from "@/lib/player-pool/storage";
import { sendProspectToPlayerPool } from "@/lib/player-pool/sendProspectToPlayerPool";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PlayerPoolStatusRow = {
  id: string;
  prospectId: string;
  publicCode: string;
  status: string;
  invitedAt: Date | null;
  profileSubmittedAt: Date | null;
  updatedAt: Date;
};

type RequestBody = {
  leagueId?: unknown;
};

function routeError(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Something went wrong.";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  const { prospectId } = await params;

  try {
    await requireAdmin();
    await ensurePlayerPoolTables();

    const prospect = await prisma.teamPlayerProspect.findUnique({
      where: { id: prospectId },
      select: { id: true, email: true },
    });

    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
    }

    const email = normalizePlayerPoolEmail(prospect.email);
    const rows = email
      ? await prisma.$queryRaw<PlayerPoolStatusRow[]>`
          SELECT
            "id",
            "prospectId",
            "publicCode",
            "status",
            "invitedAt",
            "profileSubmittedAt",
            "updatedAt"
          FROM "PlayerPoolProfile"
          WHERE "prospectId" = ${prospect.id}
             OR "emailNormalized" = ${email}
          ORDER BY CASE WHEN "prospectId" = ${prospect.id} THEN 0 ELSE 1 END
          LIMIT 1
        `
      : await prisma.$queryRaw<PlayerPoolStatusRow[]>`
          SELECT
            "id",
            "prospectId",
            "publicCode",
            "status",
            "invitedAt",
            "profileSubmittedAt",
            "updatedAt"
          FROM "PlayerPoolProfile"
          WHERE "prospectId" = ${prospect.id}
          LIMIT 1
        `;

    const profile = rows[0] ?? null;

    return NextResponse.json({
      ok: true,
      exists: Boolean(profile),
      profile: profile
        ? {
            id: profile.id,
            prospectId: profile.prospectId,
            publicCode: profile.publicCode,
            status: profile.status,
            invitedAt: profile.invitedAt?.toISOString() ?? null,
            profileSubmittedAt:
              profile.profileSubmittedAt?.toISOString() ?? null,
            updatedAt: profile.updatedAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  const { prospectId } = await params;

  try {
    const { user } = await requireAdmin();
    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const requestedLeagueId =
      typeof body?.leagueId === "string" ? body.leagueId.trim() : "";

    const result = await sendProspectToPlayerPool({
      prospectId,
      requestedLeagueId: requestedLeagueId || null,
      createdByUserId: user?.id ?? null,
    });

    revalidatePath("/admin/player-prospects");
    revalidatePath(`/admin/player-prospects/${prospectId}/communications`);
    revalidatePath("/admin/player-pool");
    revalidatePath("/admin/messaging");
    if (result.prospectTeamId) {
      revalidatePath(`/captain/team/${result.prospectTeamId}/prospects`);
    }

    return NextResponse.json({
      ok: true,
      created: result.created,
      message: result.message,
    });
  } catch (error) {
    const message = routeError(error);
    const status = message === "Prospect not found."
      ? 404
      : message.includes("not currently eligible")
        ? 409
        : message.includes("Add an email address")
          ? 400
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
