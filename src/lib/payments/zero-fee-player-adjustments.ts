import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getRelatedTeamIdsForPaymentLedger } from "@/lib/payments/team-payment-ledger";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

export const ZERO_FEE_WAIVER_NOTE = "Zero-fee player share waived by SIXFL";
export const ZERO_FEE_ADJUSTMENT_NOTE = "Zero-fee player waiver adjustment";

export type ZeroFeeAdjustmentPlayer = {
  playerMatchFeeId: string;
  teamMemberId: string;
  name: string;
  email: string | null;
  amountPence: number;
};

export type ZeroFeeAdjustmentDetail = {
  chargeId: string;
  chargeTitle: string;
  teamId: string;
  fixtureId: string;
  fixtureLabel: string;
  amountPence: number;
  players: ZeroFeeAdjustmentPlayer[];
};

export type ZeroFeeAdjustmentReconciliation = {
  changed: boolean;
  changedChargeIds: string[];
  removedStaleAdjustmentChargeIds: string[];
  adjustments: ZeroFeeAdjustmentDetail[];
};

type FixedChargeRepairRow = {
  id: string;
};

type ZeroFeeFeeRow = {
  id: string;
  teamId: string;
  fixtureId: string;
  teamMemberId: string | null;
  amountPence: number;
  teamMember: {
    user: {
      name: string | null;
      email: string | null;
    };
  } | null;
  fixture: {
    homeTeam: { name: string };
    awayTeam: { name: string };
  };
};

function removeAdjustmentCopySql(column: Prisma.Sql) {
  return Prisma.sql`NULLIF(
    BTRIM(
      REGEXP_REPLACE(
        COALESCE(${column}, ''),
        E'(^|\\n)Zero-fee player waiver adjustment:[^\\n]*(\\n|$)',
        E'\\1',
        'gi'
      )
    ),
    ''
  )`;
}

/**
 * Player payment rows describe how a captain is collecting money from players.
 * They must never alter the fixed amount SIXFL charges the team for the fixture.
 *
 * This repair runs when the team ledger is loaded so old £37-style adjustments
 * are corrected even on deployments where an earlier one-off migration did not run.
 */
export async function repairFixedFixtureChargesForTeamIds(teamIds: string[]) {
  const uniqueTeamIds = Array.from(new Set(teamIds.filter(Boolean)));
  if (uniqueTeamIds.length === 0) return [] as string[];

  const descriptionWithoutAdjustment = removeAdjustmentCopySql(
    Prisma.sql`charge."description"`,
  );

  const repaired = await prisma.$queryRaw<FixedChargeRepairRow[]>(Prisma.sql`
    WITH expected AS (
      SELECT
        charge."id",
        CASE
          WHEN charge."teamId" = fixture."homeTeamId" THEN COALESCE(
            fixture."homeMatchFeePence",
            fixture."matchFeePence"
          )
          WHEN charge."teamId" = fixture."awayTeamId" THEN COALESCE(
            fixture."awayMatchFeePence",
            fixture."matchFeePence"
          )
          ELSE NULL
        END AS "expectedAmountPence",
        COALESCE((
          SELECT SUM(transaction."amountPence")
          FROM "PaymentTransaction" transaction
          WHERE transaction."chargeId" = charge."id"
        ), 0) + COALESCE((
          SELECT SUM(fee."amountPence")
          FROM "PlayerMatchFee" fee
          WHERE fee."teamId" = charge."teamId"
            AND fee."fixtureId" = charge."fixtureId"
            AND fee."status" = 'PAID'
        ), 0) AS "paidAmountPence"
      FROM "PaymentCharge" charge
      INNER JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
      WHERE charge."teamId" IN (${Prisma.join(uniqueTeamIds)})
        AND charge."status" <> 'VOID'
    )
    UPDATE "PaymentCharge" charge
    SET
      "amountPence" = expected."expectedAmountPence",
      "status" = CASE
        WHEN expected."paidAmountPence" <= 0 THEN 'OPEN'::"PaymentChargeStatus"
        WHEN expected."paidAmountPence" >= expected."expectedAmountPence" THEN 'PAID'::"PaymentChargeStatus"
        ELSE 'PART_PAID'::"PaymentChargeStatus"
      END,
      "description" = ${descriptionWithoutAdjustment},
      "updatedAt" = NOW()
    FROM expected
    WHERE charge."id" = expected."id"
      AND expected."expectedAmountPence" IS NOT NULL
      AND expected."expectedAmountPence" > 0
      AND (
        charge."amountPence" IS DISTINCT FROM expected."expectedAmountPence"
        OR charge."description" ILIKE '%Zero-fee player waiver adjustment%'
      )
    RETURNING charge."id"
  `);

  // Remove stale waived rows where the admin-only £0 override no longer exists.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "PlayerMatchFee" fee
    SET
      "amountPence" = 0,
      "status" = 'CANCELLED'::"PlayerMatchFeeStatus",
      "paidAt" = NULL,
      "waivedAt" = NULL,
      "cancelledAt" = NOW(),
      "paymentUrl" = NULL,
      "paymentToken" = NULL,
      "note" = CONCAT_WS(
        E'\\n',
        NULLIF(
          BTRIM(
            REGEXP_REPLACE(
              COALESCE(fee."note", ''),
              E'(^|\\n)Zero-fee player share waived by SIXFL:[^\\n]*(\\n|$)',
              E'\\1',
              'gi'
            )
          ),
          ''
        ),
        'Cancelled by system repair: no valid £0 admin fee override exists.'
      ),
      "updatedAt" = NOW()
    WHERE fee."teamId" IN (${Prisma.join(uniqueTeamIds)})
      AND fee."teamMemberId" IS NOT NULL
      AND fee."status" <> 'PAID'
      AND fee."note" ILIKE '%Zero-fee player share waived by SIXFL%'
      AND NOT EXISTS (
        SELECT 1
        FROM "TeamMemberProfile" profile
        WHERE profile."teamMemberId" = fee."teamMemberId"
          AND profile."playerMatchFeePenceOverride" = 0
      )
  `);

  return repaired.map((row) => row.id);
}

async function getValidZeroFeeDetails(teamIds: string[], fixtureId?: string) {
  const rows = await prisma.playerMatchFee.findMany({
    where: {
      teamId: { in: teamIds },
      ...(fixtureId ? { fixtureId } : {}),
      status: "WAIVED",
      note: { contains: ZERO_FEE_WAIVER_NOTE },
      teamMemberId: { not: null },
    },
    include: {
      teamMember: {
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      fixture: {
        select: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  }) as ZeroFeeFeeRow[];

  const memberIds = rows
    .map((row) => row.teamMemberId)
    .filter((value): value is string => Boolean(value));
  const profiles = await getTeamMemberProfilesByTeamMemberIds(memberIds);
  const validRows = rows.filter(
    (row) =>
      Boolean(row.teamMemberId) &&
      profiles.get(row.teamMemberId!)?.playerMatchFeePenceOverride === 0,
  );

  const charges = await prisma.paymentCharge.findMany({
    where: {
      teamId: { in: teamIds },
      fixtureId: fixtureId ? fixtureId : { in: Array.from(new Set(validRows.map((row) => row.fixtureId))) },
      status: { not: "VOID" },
    },
    select: {
      id: true,
      teamId: true,
      fixtureId: true,
      title: true,
    },
  });

  return charges.flatMap<ZeroFeeAdjustmentDetail>((charge) => {
    if (!charge.fixtureId) return [];
    const matchingRows = validRows.filter(
      (row) => row.teamId === charge.teamId && row.fixtureId === charge.fixtureId,
    );
    if (matchingRows.length === 0) return [];

    const players = matchingRows.map<ZeroFeeAdjustmentPlayer>((row) => ({
      playerMatchFeeId: row.id,
      teamMemberId: row.teamMemberId!,
      name:
        row.teamMember?.user.name ||
        row.teamMember?.user.email ||
        "Unnamed player",
      email: row.teamMember?.user.email ?? null,
      amountPence: row.amountPence,
    }));

    return [{
      chargeId: charge.id,
      chargeTitle: charge.title,
      teamId: charge.teamId,
      fixtureId: charge.fixtureId,
      fixtureLabel: `${matchingRows[0].fixture.homeTeam.name} vs ${matchingRows[0].fixture.awayTeam.name}`,
      amountPence: players.reduce((sum, player) => sum + player.amountPence, 0),
      players,
    }];
  });
}

async function reconcile(input: {
  teamIds: string[];
  fixtureId?: string;
}): Promise<ZeroFeeAdjustmentReconciliation> {
  const changedChargeIds = await repairFixedFixtureChargesForTeamIds(input.teamIds);
  const adjustments = await getValidZeroFeeDetails(input.teamIds, input.fixtureId);

  return {
    changed: changedChargeIds.length > 0,
    changedChargeIds,
    removedStaleAdjustmentChargeIds: changedChargeIds,
    adjustments,
  };
}

export async function reconcileZeroFeePlayerAdjustmentsForTeam(teamId: string) {
  const identity = await getRelatedTeamIdsForPaymentLedger(teamId);
  if (!identity) {
    return {
      changed: false,
      changedChargeIds: [],
      removedStaleAdjustmentChargeIds: [],
      adjustments: [],
    } satisfies ZeroFeeAdjustmentReconciliation;
  }

  return reconcile({ teamIds: identity.relatedTeamIds });
}

export async function reconcileZeroFeePlayerAdjustmentsForFixture(input: {
  teamId: string;
  fixtureId: string;
}) {
  return reconcile({ teamIds: [input.teamId], fixtureId: input.fixtureId });
}
