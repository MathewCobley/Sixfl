import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KIT_PACKAGE_CHANGEOVER_AT = new Date("2026-08-01T10:33:15.000Z");

type KitOfferRow = {
  legacyOffer: boolean;
  wantsKitOffer: boolean;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const rows = await prisma.$queryRaw<KitOfferRow[]>`
    SELECT
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = ${teamid}
            AND lead."wantsFreeKit" = TRUE
            AND lead."createdAt" < ${KIT_PACKAGE_CHANGEOVER_AT}
        )
        OR (
          EXISTS (
            SELECT 1
            FROM "Team" legacy_team
            WHERE legacy_team."id" = ${teamid}
              AND legacy_team."wantsFreeKit" = TRUE
              AND legacy_team."createdAt" < ${KIT_PACKAGE_CHANGEOVER_AT}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "InterestLead" linked_lead
            WHERE linked_lead."convertedTeamId" = ${teamid}
              AND linked_lead."wantsFreeKit" = TRUE
          )
        )
      ) AS "legacyOffer",
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" offer_lead
          WHERE offer_lead."convertedTeamId" = ${teamid}
            AND offer_lead."wantsFreeKit" = TRUE
        )
        OR EXISTS (
          SELECT 1
          FROM "Team" offer_team
          WHERE offer_team."id" = ${teamid}
            AND offer_team."wantsFreeKit" = TRUE
        )
      ) AS "wantsKitOffer"
  `;

  const legacyOffer = Boolean(rows[0]?.legacyOffer);
  const wantsKitOffer = Boolean(rows[0]?.wantsKitOffer);
  const offerType = legacyOffer
    ? "FREE_KIT"
    : wantsKitOffer
      ? "FOUNDING_PACKAGE"
      : "STANDARD";

  return NextResponse.json({
    legacyOffer,
    wantsKitOffer,
    offerType,
    kitPricePence:
      offerType === "FREE_KIT" ? 0 : offerType === "FOUNDING_PACKAGE" ? 1000 : 2000,
    sevenKitTotalPence:
      offerType === "FREE_KIT" ? 0 : offerType === "FOUNDING_PACKAGE" ? 7000 : 14000,
  });
}
