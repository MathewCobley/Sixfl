import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type TeamOfferAdminRow = {
  teamId: string;
  teamName: string;
  wantsFreeKit: boolean;
  leadWantsFreeKit: boolean;
  freeKitOfferExpiredAt: Date | null;
  freeKitOfferExpiryReason: string | null;
  hasExistingOrder: boolean;
  hasLiveOrder: boolean;
  hasExtraKitCharge: boolean;
};

const EXTRA_KIT_TITLE_PREFIX = "Additional kit contribution •";

async function getTeamOfferStatus(teamId: string) {
  const rows = await prisma.$queryRaw<TeamOfferAdminRow[]>(Prisma.sql`
    SELECT
      team."id" AS "teamId",
      team."name" AS "teamName",
      COALESCE(team."wantsFreeKit", FALSE) AS "wantsFreeKit",
      EXISTS (
        SELECT 1
        FROM "InterestLead" lead
        WHERE lead."convertedTeamId" = team."id"
          AND lead."wantsFreeKit" = TRUE
      ) AS "leadWantsFreeKit",
      team."freeKitOfferExpiredAt" AS "freeKitOfferExpiredAt",
      team."freeKitOfferExpiryReason" AS "freeKitOfferExpiryReason",
      EXISTS (
        SELECT 1
        FROM "TeamKitOrder" kit_order
        WHERE kit_order."teamId" = team."id"
      ) AS "hasExistingOrder",
      EXISTS (
        SELECT 1
        FROM "TeamKitOrder" kit_order
        WHERE kit_order."teamId" = team."id"
          AND kit_order."status"::text <> 'CANCELLED'
      ) AS "hasLiveOrder",
      EXISTS (
        SELECT 1
        FROM "PaymentCharge" charge
        WHERE charge."teamId" = team."id"
          AND charge."title" LIKE ${`${EXTRA_KIT_TITLE_PREFIX}%`}
          AND charge."status"::text <> 'VOID'
      ) AS "hasExtraKitCharge"
    FROM "Team" team
    WHERE team."id" = ${teamId}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

function responseFor(row: TeamOfferAdminRow) {
  return {
    teamId: row.teamId,
    teamName: row.teamName,
    wantsFreeKit: Boolean(row.wantsFreeKit),
    originalRegistrationOffer: Boolean(row.leadWantsFreeKit),
    manuallyGranted: Boolean(row.wantsFreeKit && !row.leadWantsFreeKit),
    expired: Boolean(row.freeKitOfferExpiredAt),
    expiredAt: row.freeKitOfferExpiredAt,
    reason: row.freeKitOfferExpiryReason,
    hasExistingOrder: Boolean(row.hasExistingOrder),
    hasLiveOrder: Boolean(row.hasLiveOrder),
    hasExtraKitCharge: Boolean(row.hasExtraKitCharge),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  await requireAdmin();
  const { teamId } = await params;
  const row = await getTeamOfferStatus(teamId);

  if (!row) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  return NextResponse.json(responseFor(row));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { user } = await requireAdmin();
  const { teamId } = await params;
  const body = (await request.json().catch(() => null)) as
    | { expired?: unknown; manualOffer?: unknown; reason?: unknown }
    | null;

  const hasManualOfferChange = typeof body?.manualOffer === "boolean";
  const hasExpiryChange = typeof body?.expired === "boolean";

  if (!hasManualOfferChange && !hasExpiryChange) {
    return NextResponse.json(
      { error: "manualOffer or expired must be a boolean" },
      { status: 400 },
    );
  }

  const current = await getTeamOfferStatus(teamId);
  if (!current) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  if (hasManualOfferChange) {
    const enabled = body?.manualOffer === true;

    if (!enabled && current.leadWantsFreeKit) {
      return NextResponse.json(
        { error: "This team has an original-registration free-kit entitlement and it cannot be removed here." },
        { status: 409 },
      );
    }

    if (!enabled && (current.hasLiveOrder || current.hasExtraKitCharge)) {
      return NextResponse.json(
        { error: "This team already has a live kit order or additional-kit charge, so its entitlement is preserved." },
        { status: 409 },
      );
    }

    const reason =
      typeof body?.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 500)
        : null;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "Team"
        SET
          "wantsFreeKit" = ${enabled},
          "freeKitOfferExpiredAt" = ${enabled ? null : current.freeKitOfferExpiredAt},
          "freeKitOfferExpiryReason" = ${enabled ? null : current.freeKitOfferExpiryReason},
          "updatedAt" = NOW()
        WHERE "id" = ${teamId}
      `);

      if (current.wantsFreeKit !== enabled) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "TeamFreeKitOfferAudit" (
            "id", "teamId", "previousValue", "newValue", "actorUserId", "reason", "createdAt"
          ) VALUES (
            ${randomUUID()}, ${teamId}, ${current.wantsFreeKit}, ${enabled}, ${user?.id ?? null}, ${reason}, NOW()
          )
        `);
      }
    });
  } else if (hasExpiryChange) {
    const expired = body?.expired === true;

    if (expired && current.hasExistingOrder) {
      return NextResponse.json(
        {
          error:
            "This team already has a kit order. Its existing kit entitlement is preserved.",
        },
        { status: 409 },
      );
    }

    const reason = expired
      ? "Admin marked the unclaimed free-kit offer as not applied / expired. Original free-kit interest remains on record. Paid kit ordering remains available."
      : null;

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Team"
      SET
        "freeKitOfferExpiredAt" = ${expired ? new Date() : null},
        "freeKitOfferExpiryReason" = ${reason},
        "updatedAt" = NOW()
      WHERE "id" = ${teamId}
    `);
  }

  const updated = await getTeamOfferStatus(teamId);
  if (!updated) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  return NextResponse.json(responseFor(updated));
}
