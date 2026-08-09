import { Prisma, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";
import { ensurePlayerMatchFeePaymentDetailsForFees } from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

type TemporaryMatchFeeRow = {
  id: string;
  amountPence: number;
  paymentUrl: string | null;
  createdAt: Date;
  teamName: string;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
};

async function getTargetUserId(input: {
  sessionUserId: string;
  role: UserRole;
  teamId: string;
  previewMembershipId: string;
}) {
  if (input.role !== UserRole.ADMIN || !input.previewMembershipId || !input.teamId) {
    return input.sessionUserId;
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: input.previewMembershipId,
      teamId: input.teamId,
    },
    select: { userId: true },
  });

  return membership?.userId ?? input.sessionUserId;
}

async function loadTemporaryFees(userId: string) {
  return prisma.$queryRaw<TemporaryMatchFeeRow[]>(Prisma.sql`
    SELECT
      fee."id",
      fee."amountPence",
      fee."paymentUrl",
      fee."createdAt",
      team."name" AS "teamName",
      fixture."kickoffAt",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName"
    FROM "PlayerMatchFee" fee
    INNER JOIN "Team" team ON team."id" = fee."teamId"
    INNER JOIN "Fixture" fixture ON fixture."id" = fee."fixtureId"
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    WHERE fee."temporaryUserId" = ${userId}
      AND fee."status" = 'OPEN'::"PlayerMatchFeeStatus"
      AND fixture."publishedAt" IS NOT NULL
    ORDER BY fixture."kickoffAt" ASC, fee."createdAt" ASC
  `);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: noStoreHeaders });
  }

  const sessionUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (!sessionUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404, headers: noStoreHeaders });
  }

  const url = new URL(request.url);
  const teamId = url.searchParams.get("teamId")?.trim() ?? "";
  const previewMembershipId = url.searchParams.get("previewMembershipId")?.trim() ?? "";
  const targetUserId = await getTargetUserId({
    sessionUserId: sessionUser.id,
    role: sessionUser.role,
    teamId,
    previewMembershipId,
  });

  let fees = await loadTemporaryFees(targetUserId);

  if (fees.length > 0) {
    await ensurePlayerMatchFeePaymentDetailsForFees(fees.map((fee) => fee.id));
    fees = await loadTemporaryFees(targetUserId);
  }

  return NextResponse.json(
    {
      fees: fees.map((fee) => ({
        ...fee,
        createdAt: fee.createdAt.toISOString(),
        kickoffAt: fee.kickoffAt.toISOString(),
      })),
    },
    { headers: noStoreHeaders },
  );
}
