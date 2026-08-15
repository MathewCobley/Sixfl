"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  TEAM_KIT_QUANTITY,
  isTeamKitSize,
  type TeamKitSize,
} from "@/lib/kits/constants";
import { getKitDesignById, getTeamKitOrder } from "@/lib/kits/db";
import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

const FIXED_SOCK_SIZE = "LARGE_8_PLUS" as const;

type SubmittedItem = {
  position: number;
  backName: string | null;
  shirtNumber: number;
  kitSize: TeamKitSize;
};

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function buildRedirect(
  teamId: string,
  input: { saved?: boolean; submitted?: boolean; error?: string },
) {
  const params = new URLSearchParams();
  if (input.saved) params.set("saved", "1");
  if (input.submitted) params.set("submitted", "1");
  if (input.error) params.set("error", input.error);
  const query = params.toString();
  return `/captain/team/${teamId}/kit${query ? `?${query}` : ""}`;
}

function cleanBackName(value: string) {
  return value
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^A-Z0-9 '&.-]/g, "")
    .trim()
    .slice(0, 18);
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, Prisma.JsonValue>;
  }
  return value as Record<string, Prisma.JsonValue>;
}

async function syncSelectedKitToTeam(input: {
  teamId: string;
  design: NonNullable<Awaited<ReturnType<typeof getKitDesignById>>>;
}) {
  const { recipient } = await upsertTeamNotificationRecipient(input.teamId);
  const metadata = {
    ...jsonObject(recipient.metadata),
    kitDesignId: input.design.id,
    kitDesignCode: input.design.code,
    kitDesignName: input.design.name,
    kitPrimaryColour: input.design.primaryColour,
    kitSecondaryColour: input.design.secondaryColour,
    kitStyle: input.design.style,
    kitImageUrl: `/api/kits/${input.design.id}/image?size=full`,
  };

  await prisma.notificationRecipient.update({
    where: { id: recipient.id },
    data: {
      metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue,
    },
  });
}

export async function saveTeamKitOrderV2Action(formData: FormData) {
  const teamId = readString(formData, "teamId");
  if (!teamId) redirect("/captain?error=missing_team");

  const access = await requireCaptain(teamId);
  const [existingOrder, paymentSummary] = await Promise.all([
    getTeamKitOrder(teamId),
    getTeamExtraKitPaymentSummary(teamId),
  ]);

  if (
    existingOrder &&
    ["ORDERED", "FULFILLED", "CANCELLED"].includes(existingOrder.status)
  ) {
    redirect(buildRedirect(teamId, { error: "order_locked" }));
  }

  const kitQuantity = Math.max(
    TEAM_KIT_QUANTITY,
    paymentSummary.totalKitQuantity,
    existingOrder?.kitQuantity ?? 0,
  );

  const kitDesignId = readString(formData, "kitDesignId");
  if (!kitDesignId) {
    redirect(buildRedirect(teamId, { error: "choose_design" }));
  }

  const design = await getKitDesignById(kitDesignId);
  if (!design) {
    redirect(buildRedirect(teamId, { error: "design_unavailable" }));
  }

  const items: SubmittedItem[] = [];
  const numbers = new Set<number>();

  for (let position = 1; position <= kitQuantity; position += 1) {
    const kitSize = readString(formData, `kitSize_${position}`);
    const shirtNumber = Number(readString(formData, `shirtNumber_${position}`));

    if (!isTeamKitSize(kitSize)) {
      redirect(buildRedirect(teamId, { error: `missing_kit_size_${position}` }));
    }
    if (!Number.isInteger(shirtNumber) || shirtNumber < 1 || shirtNumber > 99) {
      redirect(buildRedirect(teamId, { error: `invalid_number_${position}` }));
    }
    if (numbers.has(shirtNumber)) {
      redirect(buildRedirect(teamId, { error: "duplicate_numbers" }));
    }
    numbers.add(shirtNumber);

    items.push({
      position,
      backName: cleanBackName(readString(formData, `backName_${position}`)) || null,
      shirtNumber,
      kitSize,
    });
  }

  const intent = readString(formData, "intent");
  const status = intent === "submit" ? "SUBMITTED" : "DRAFT";
  const orderId = existingOrder?.id ?? randomUUID();
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
        SELECT "status"::text AS "status"
        FROM "TeamKitOrder"
        WHERE "teamId" = ${teamId}
        FOR UPDATE
      `);
      const lockedStatus = lockedRows[0]?.status ?? null;
      if (lockedStatus && ["ORDERED", "FULFILLED", "CANCELLED"].includes(lockedStatus)) {
        throw new Error("KIT_ORDER_LOCKED");
      }

      if (status === "SUBMITTED") {
        // Lock the league row before checking the design. This serialises kit
        // submissions within a league, so two teams cannot submit the same
        // previously-unreserved design at the same moment.
        const leagueRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT league."id"
          FROM "League" league
          JOIN "Team" team ON team."leagueId" = league."id"
          WHERE team."id" = ${teamId}
          FOR UPDATE OF league
        `);

        if (leagueRows[0]) {
          const designConflict = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT other_order."id"
            FROM "TeamKitOrder" other_order
            JOIN "Team" other_team ON other_team."id" = other_order."teamId"
            WHERE other_team."leagueId" = ${leagueRows[0].id}
              AND other_order."teamId" <> ${teamId}
              AND other_order."kitDesignId" = ${kitDesignId}
              AND other_order."status"::text NOT IN ('DRAFT', 'CANCELLED')
            LIMIT 1
          `);

          if (designConflict[0]) {
            throw new Error("KIT_DESIGN_TAKEN");
          }
        }
      }

      if (existingOrder) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "TeamKitOrder"
          SET
            "kitDesignId" = ${kitDesignId},
            "status" = ${status}::"TeamKitOrderStatus",
            "kitQuantity" = ${kitQuantity},
            "captainNotes" = ${readString(formData, "captainNotes") || null},
            "submittedByUserId" = CASE
              WHEN ${status} = 'SUBMITTED' THEN ${access.user?.id ?? null}
              ELSE "submittedByUserId"
            END,
            "lastEditedByUserId" = ${access.user?.id ?? null},
            "submittedAt" = CASE
              WHEN ${status} = 'SUBMITTED' THEN ${now}
              ELSE NULL
            END,
            "approvedAt" = NULL,
            "orderedAt" = NULL,
            "fulfilledAt" = NULL,
            "updatedAt" = ${now}
          WHERE "id" = ${orderId}
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "TeamKitOrder" (
            "id", "teamId", "kitDesignId", "status", "kitQuantity",
            "captainNotes", "submittedByUserId", "lastEditedByUserId",
            "submittedAt", "createdAt", "updatedAt"
          )
          VALUES (
            ${orderId}, ${teamId}, ${kitDesignId},
            ${status}::"TeamKitOrderStatus", ${kitQuantity},
            ${readString(formData, "captainNotes") || null},
            ${status === "SUBMITTED" ? access.user?.id ?? null : null},
            ${access.user?.id ?? null},
            ${status === "SUBMITTED" ? now : null}, ${now}, ${now}
          )
        `);
      }

      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "TeamKitOrderItem"
        WHERE "orderId" = ${orderId}
      `);

      for (const item of items) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "TeamKitOrderItem" (
            "id", "orderId", "position", "backName", "shirtNumber",
            "kitSize", "sockSize", "createdAt", "updatedAt"
          )
          VALUES (
            ${randomUUID()}, ${orderId}, ${item.position}, ${item.backName},
            ${item.shirtNumber}, ${item.kitSize}::"TeamKitSize",
            ${FIXED_SOCK_SIZE}::"TeamKitSockSize", ${now}, ${now}
          )
        `);
      }

      const savedRows = await tx.$queryRaw<Array<{ kitQuantity: number; rowCount: bigint }>>(
        Prisma.sql`
          SELECT
            orders."kitQuantity",
            COUNT(items."id")::bigint AS "rowCount"
          FROM "TeamKitOrder" orders
          LEFT JOIN "TeamKitOrderItem" items ON items."orderId" = orders."id"
          WHERE orders."id" = ${orderId}
          GROUP BY orders."kitQuantity"
        `,
      );
      if (
        savedRows[0]?.kitQuantity !== kitQuantity ||
        Number(savedRows[0]?.rowCount ?? 0) !== kitQuantity
      ) {
        throw new Error("KIT_ROWS_NOT_SAVED");
      }
    });

    await syncSelectedKitToTeam({ teamId, design });
  } catch (error) {
    console.error("Native team kit save failed", {
      error,
      teamId,
      kitQuantity,
      submittedPositions: items.map((item) => item.position),
    });
    redirect(
      buildRedirect(teamId, {
        error:
          error instanceof Error && error.message === "KIT_ORDER_LOCKED"
            ? "order_locked"
            : error instanceof Error && error.message === "KIT_DESIGN_TAKEN"
              ? "design_taken"
              : "extra_kits_not_saved",
      }),
    );
  }

  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/kit`);
  revalidatePath("/admin/kits");

  redirect(
    buildRedirect(teamId, {
      saved: status === "DRAFT",
      submitted: status === "SUBMITTED",
    }),
  );
}
