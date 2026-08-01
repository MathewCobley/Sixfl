import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KIT_PACKAGE_CHANGEOVER_AT = new Date("2026-08-01T10:33:15.000Z");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const rows = await prisma.$queryRaw<Array<{ legacyOffer: boolean }>>`
    SELECT (
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
    ) AS "legacyOffer"
  `;

  return NextResponse.json({
    legacyOffer: Boolean(rows[0]?.legacyOffer),
  });
}
