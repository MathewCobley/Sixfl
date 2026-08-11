import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type TeamOfferAdminRow = {
  teamId: string;
  teamName: string;
  wantsFreeKit: boolean;
  freeKitOfferExpiredAt: Date | null;
  freeKitOfferExpiryReason: string | null;
  hasExistingOrder: boolean;
};

async function getTeamOfferStatus(teamId: string) {
  const rows = await prisma.$queryRaw<TeamOfferAdminRow[]>(Prisma.sql`
    SELECT
      team."id" AS "teamId",
      team."name" AS "teamName",
      COALESCE(team."wantsFreeKit", FALSE) AS "wantsFreeKit",
      team."freeKitOfferExpiredAt" AS "freeKitOfferExpiredAt",
      team."freeKitOfferExpiryReason" AS "freeKitOfferExpiryReason",
      EXISTS (
        SELECT 1
        FROM "TeamKitOrder" kit_order
        WHERE kit_order."teamId" = team."id"
      ) AS "hasExistingOrder"
    FROM "Team" team
    WHERE team."id" = ${teamId}
    LIMIT 1
  `);

  return rows[0] ?? null;
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

  return NextResponse.json({
    teamId: row.teamId,
    teamName: row.teamName,
    wantsFreeKit: Boolean(row.wantsFreeKit),
    expired: Boolean(row.freeKitOfferExpiredAt),
    expiredAt: row.freeKitOfferExpiredAt,
    reason: row.freeKitOfferExpiryReason,
    hasExistingOrder: Boolean(row.hasExistingOrder),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  await requireAdmin();
  const { teamId } = await params;
  const body = (await request.json().catch(() => null)) as { expired?: unknown } | null;

  if (typeof body?.expired !== "boolean") {
    return NextResponse.json({ error: "expired must be a boolean" }, { status: 400 });
  }

  const current = await getTeamOfferStatus(teamId);
  if (!current) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  if (body.expired && current.hasExistingOrder) {
    return NextResponse.json(
      {
        error:
          "This team already has a kit order. The free-kit offer cannot be hidden from a submitted/existing order.",
      },
      { status: 409 },
    );
  }

  const reason = body.expired
    ? "Admin marked the unclaimed free-kit offer as not applied / expired. Original free-kit interest remains on record."
    : null;

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Team"
    SET
      "freeKitOfferExpiredAt" = ${body.expired ? new Date() : null},
      "freeKitOfferExpiryReason" = ${reason},
      "updatedAt" = NOW()
    WHERE "id" = ${teamId}
  `);

  const updated = await getTeamOfferStatus(teamId);
  return NextResponse.json({
    teamId: updated?.teamId ?? teamId,
    teamName: updated?.teamName ?? current.teamName,
    wantsFreeKit: Boolean(updated?.wantsFreeKit),
    expired: Boolean(updated?.freeKitOfferExpiredAt),
    expiredAt: updated?.freeKitOfferExpiredAt ?? null,
    reason: updated?.freeKitOfferExpiryReason ?? null,
    hasExistingOrder: Boolean(updated?.hasExistingOrder),
  });
}
