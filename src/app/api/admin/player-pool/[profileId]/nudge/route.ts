// ========================================
// File: src/app/api/admin/player-pool/[profileId]/nudge/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  queuePlayerPoolProfileReminder,
  type PlayerPoolProfileReminderTarget,
} from "@/lib/player-pool/profile-reminders";
import { ensurePlayerPoolTables } from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function routeError(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The PlayerPool profile reminder could not be sent.";
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const { profileId } = await params;

  try {
    const { user } = await requireAdmin();
    await ensurePlayerPoolTables();

    const rows = await prisma.$queryRaw<PlayerPoolProfileReminderTarget[]>`
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

    const result = await queuePlayerPoolProfileReminder({
      profile,
      createdByUserId: user?.id ?? null,
      origin: "player_pool_profile_nudge",
      originLabel: "PlayerPool profile reminder sent from admin",
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message },
        { status: result.reason === "missing_email" ? 400 : 409 },
      );
    }

    revalidatePath("/admin/player-pool");
    revalidatePath("/admin/messaging");
    revalidatePath(`/admin/player-prospects/${profile.prospectId}/communications`);

    return NextResponse.json({
      ok: true,
      message: `Profile reminder queued for ${result.displayName}.`,
      nudgedAt: result.recordedAt.toISOString(),
      dispatchStatus: result.dispatchStatus,
      nudgedBy: user?.name ?? user?.email ?? "SIXFL admin",
    });
  } catch (error) {
    console.error("PlayerPool profile reminder failed", error);
    return NextResponse.json({ error: routeError(error) }, { status: 500 });
  }
}
