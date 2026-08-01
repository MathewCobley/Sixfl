import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const KIT_PACKAGE_CHANGEOVER_AT = new Date("2026-08-01T10:33:15.000Z");

type KitOfferTeamRow = {
  id: string;
  legacyOffer: boolean;
};

export async function GET() {
  await requireAdmin();

  const teams = await prisma.$queryRaw<KitOfferTeamRow[]>(Prisma.sql`
    SELECT
      team."id",
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = team."id"
            AND lead."wantsFreeKit" = true
            AND lead."createdAt" < ${KIT_PACKAGE_CHANGEOVER_AT}
        )
        OR (
          team."createdAt" < ${KIT_PACKAGE_CHANGEOVER_AT}
          AND NOT EXISTS (
            SELECT 1
            FROM "InterestLead" linked_lead
            WHERE linked_lead."convertedTeamId" = team."id"
              AND linked_lead."wantsFreeKit" = true
          )
        )
      ) AS "legacyOffer"
    FROM "Team" team
    WHERE team."wantsFreeKit" = true
    ORDER BY team."name" ASC
  `);

  return NextResponse.json({
    teamIds: teams.map((team) => team.id),
    teams: teams.map((team) => ({
      id: team.id,
      legacyOffer: Boolean(team.legacyOffer),
      offerType: team.legacyOffer ? "FREE_KIT" : "PAID_PACKAGE",
    })),
  });
}
