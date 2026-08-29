// ========================================
// File: src/app/api/admin/player-pool/bulk-profile-reminders/route.ts
// ========================================

import { randomUUID } from "node:crypto";
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

const BATCH_SIZE = 6;
const ACCEPTED_DISPATCH_STATUSES = new Set(["QUEUED", "PROCESSING", "SENT"]);

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Unknown PlayerPool reminder error";
}

export async function POST() {
  try {
    const { user } = await requireAdmin();
    await ensurePlayerPoolTables();

    const profiles = await prisma.$queryRaw<PlayerPoolProfileReminderTarget[]>`
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
      WHERE profile."status" = 'INVITED'
        AND profile."profileSubmittedAt" IS NULL
      ORDER BY COALESCE(profile."invitedAt", profile."createdAt") ASC
    `;

    const bulkRunId = randomUUID();
    const summary = {
      targeted: profiles.length,
      queued: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (let index = 0; index < profiles.length; index += BATCH_SIZE) {
      const batch = profiles.slice(index, index + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((profile) =>
          queuePlayerPoolProfileReminder({
            profile,
            createdByUserId: user?.id ?? null,
            origin: "player_pool_profile_bulk_reminder",
            originLabel: "Bulk PlayerPool profile reminder sent from admin",
            bulkRunId,
          }),
        ),
      );

      results.forEach((result, resultIndex) => {
        const profile = batch[resultIndex];

        if (result.status === "rejected") {
          summary.failed += 1;
          if (summary.errors.length < 8) {
            summary.errors.push(
              `${profile.publicCode}: ${getErrorMessage(result.reason)}`,
            );
          }
          return;
        }

        if (!result.value.ok) {
          summary.skipped += 1;
          if (summary.errors.length < 8) {
            summary.errors.push(
              `${profile.publicCode}: ${result.value.message}`,
            );
          }
          return;
        }

        if (ACCEPTED_DISPATCH_STATUSES.has(result.value.dispatchStatus)) {
          summary.queued += 1;
          return;
        }

        summary.skipped += 1;
        if (summary.errors.length < 8) {
          summary.errors.push(
            `${profile.publicCode}: delivery status ${result.value.dispatchStatus.toLowerCase()}`,
          );
        }
      });
    }

    revalidatePath("/admin/player-pool");
    revalidatePath("/admin/messaging");

    return NextResponse.json({
      ok: true,
      bulkRunId,
      ...summary,
    });
  } catch (error) {
    console.error("Bulk PlayerPool profile reminders failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
