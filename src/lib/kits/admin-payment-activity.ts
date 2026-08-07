import { Prisma } from "@prisma/client";

import {
  EXTRA_KIT_TITLE_PREFIX,
  getTeamExtraKitPaymentSummary,
  type TeamExtraKitPaymentSummary,
} from "@/lib/kits/extra-kit-quantity";
import { prisma } from "@/lib/prisma";

export type AdminKitPaymentActivity = TeamExtraKitPaymentSummary & {
  teamId: string;
  teamName: string;
  leagueName: string | null;
  leagueSeason: string | null;
  latestPaymentActivityAt: Date;
};

export async function listAdminKitPaymentActivity(): Promise<
  AdminKitPaymentActivity[]
> {
  const teams = await prisma.$queryRaw<
    Array<{
      teamId: string;
      teamName: string;
      leagueName: string | null;
      leagueSeason: string | null;
      latestPaymentActivityAt: Date;
    }>
  >(Prisma.sql`
    SELECT
      team."id" AS "teamId",
      team."name" AS "teamName",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason",
      MAX(charge."updatedAt") AS "latestPaymentActivityAt"
    FROM "PaymentCharge" AS charge
    INNER JOIN "Team" AS team ON team."id" = charge."teamId"
    LEFT JOIN "League" AS league ON league."id" = team."leagueId"
    WHERE charge."title" LIKE ${`${EXTRA_KIT_TITLE_PREFIX}%`}
      AND charge."status"::text <> 'VOID'
    GROUP BY team."id", team."name", league."name", league."season"
    ORDER BY MAX(charge."updatedAt") DESC
  `);

  const result = await Promise.all(
    teams.map(async (team) => ({
      ...team,
      ...(await getTeamExtraKitPaymentSummary(team.teamId)),
    })),
  );

  return result.filter(
    (team) =>
      team.paidExtraKitQuantity > 0 || team.pendingExtraKitQuantity > 0,
  );
}
