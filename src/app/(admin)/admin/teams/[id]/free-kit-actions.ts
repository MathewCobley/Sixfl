"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const EXTRA_KIT_TITLE_PREFIX = "Additional kit contribution •";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function destination(teamId: string, result: string) {
  return `/admin/teams/${encodeURIComponent(teamId)}?freeKit=${encodeURIComponent(result)}`;
}

export async function updateManualFreeKitOfferAction(formData: FormData) {
  const { user } = await requireAdmin();
  const teamId = text(formData, "teamId");
  const enabled = text(formData, "enabled") === "true";
  const confirmed = text(formData, "confirmed") === "yes";
  const reason = text(formData, "reason").slice(0, 500) || null;

  if (!teamId) redirect("/admin/teams?freeKit=missing_team");
  if (!confirmed) redirect(destination(teamId, "confirm_required"));

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        wantsFreeKit: boolean;
        leadWantsFreeKit: boolean;
      }>>(Prisma.sql`
        SELECT
          team."id",
          COALESCE(team."wantsFreeKit", FALSE) AS "wantsFreeKit",
          EXISTS (
            SELECT 1
            FROM "InterestLead" lead
            WHERE lead."convertedTeamId" = team."id"
              AND lead."wantsFreeKit" = TRUE
          ) AS "leadWantsFreeKit"
        FROM "Team" team
        WHERE team."id" = ${teamId}
        FOR UPDATE
      `);

      const team = rows[0];
      if (!team) throw new Error("TEAM_NOT_FOUND");

      if (!enabled && team.leadWantsFreeKit) {
        throw new Error("ORIGINAL_REGISTRATION_OFFER");
      }

      if (!enabled && team.wantsFreeKit) {
        const [orderRows, chargeRows] = await Promise.all([
          tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
            SELECT "id", "status"::text AS "status"
            FROM "TeamKitOrder"
            WHERE "teamId" = ${teamId}
              AND "status"::text <> 'CANCELLED'
            LIMIT 1
          `),
          tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id"
            FROM "PaymentCharge"
            WHERE "teamId" = ${teamId}
              AND "title" LIKE ${`${EXTRA_KIT_TITLE_PREFIX}%`}
              AND "status"::text <> 'VOID'
            LIMIT 1
          `),
        ]);

        if (orderRows[0] || chargeRows[0]) {
          throw new Error("OFFER_IN_USE");
        }
      }

      if (team.wantsFreeKit === enabled) {
        return { changed: false };
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE "Team"
        SET "wantsFreeKit" = ${enabled}
        WHERE "id" = ${teamId}
      `);

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "TeamFreeKitOfferAudit" (
          "id", "teamId", "previousValue", "newValue", "actorUserId", "reason", "createdAt"
        ) VALUES (
          ${randomUUID()}, ${teamId}, ${team.wantsFreeKit}, ${enabled}, ${user?.id ?? null}, ${reason}, NOW()
        )
      `);

      return { changed: true };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 15000,
    });

    revalidatePath(`/admin/teams/${teamId}`);
    revalidatePath("/admin/teams/free-kit");
    revalidatePath("/admin/kits");
    revalidatePath(`/captain/team/${teamId}`);
    revalidatePath(`/captain/team/${teamId}/kit`);

    redirect(destination(teamId, result.changed ? (enabled ? "granted" : "removed") : "unchanged"));
  } catch (error) {
    const code = error instanceof Error ? error.message : "SAVE_FAILED";
    if (code === "ORIGINAL_REGISTRATION_OFFER") {
      redirect(destination(teamId, "original_offer"));
    }
    if (code === "OFFER_IN_USE") {
      redirect(destination(teamId, "offer_in_use"));
    }
    if (code === "TEAM_NOT_FOUND") {
      redirect("/admin/teams?freeKit=missing_team");
    }
    console.error("Manual free kit offer update failed", error);
    redirect(destination(teamId, "save_failed"));
  }
}
