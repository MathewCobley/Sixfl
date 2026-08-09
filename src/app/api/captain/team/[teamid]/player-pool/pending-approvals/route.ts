import { NextResponse } from "next/server";

import { ensurePlayerPoolTables } from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PendingApprovalRow = {
  requestId: string;
  status: string;
  publicCode: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  requestedAt: Date;
  introducedAt: Date | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  await ensurePlayerPoolTables();

  const items = await prisma.$queryRaw<PendingApprovalRow[]>`
    SELECT
      request."id" AS "requestId",
      request."status",
      profile."publicCode",
      prospect."firstName",
      prospect."lastName",
      prospect."email",
      prospect."phone",
      request."requestedAt",
      request."introducedAt"
    FROM "PlayerPoolIntroductionRequest" request
    JOIN "PlayerPoolProfile" profile ON profile."id" = request."profileId"
    JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
    WHERE request."teamId" = ${teamid}
      AND request."status" IN ('REQUESTED', 'INTRODUCED')
      AND NOT EXISTS (
        SELECT 1
        FROM "TeamMember" member
        JOIN "User" member_user ON member_user."id" = member."userId"
        WHERE member."teamId" = request."teamId"
          AND member_user."email" IS NOT NULL
          AND prospect."email" IS NOT NULL
          AND LOWER(TRIM(member_user."email")) = LOWER(TRIM(prospect."email"))
      )
    ORDER BY COALESCE(request."introducedAt", request."requestedAt") DESC
  `;

  return NextResponse.json(
    {
      items: items.map((item) => ({
        ...item,
        requestedAt: item.requestedAt.toISOString(),
        introducedAt: item.introducedAt?.toISOString() ?? null,
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
