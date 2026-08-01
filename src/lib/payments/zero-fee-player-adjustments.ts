import { prisma } from "@/lib/prisma";
import { getRelatedTeamIdsForPaymentLedger } from "@/lib/payments/team-payment-ledger";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

export const ZERO_FEE_WAIVER_NOTE = "Zero-fee player share waived by SIXFL";
export const ZERO_FEE_ADJUSTMENT_NOTE = "Zero-fee player waiver adjustment";

type ZeroFeeFeeRow = Awaited<ReturnType<typeof getMarkedZeroFeeRows>>[number];

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

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function feeKey(teamId: string, fixtureId: string) {
  return `${teamId}:${fixtureId}`;
}

function getPlayerName(row: ZeroFeeFeeRow) {
  return row.teamMember?.user.name || row.teamMember?.user.email || "Unnamed player";
}

function getMarkedAdjustmentPence(description: string | null) {
  const matches = Array.from(
    (description ?? "").matchAll(
      /Zero-fee player waiver adjustment:\s*£([\d,]+(?:\.\d{1,2})?)/gi,
    ),
  );
  const latest = matches.at(-1)?.[1];
  if (!latest) return 0;

  const pounds = Number(latest.replaceAll(",", ""));
  return Number.isFinite(pounds) ? Math.round(pounds * 100) : 0;
}

function removeOldAdjustmentCopy(description: string | null) {
  const cleaned = (description ?? "")
    .split("\n")
    .filter((line) => !line.trim().startsWith(ZERO_FEE_ADJUSTMENT_NOTE))
    .join("\n")
    .replace(
      /\s*Zero-fee player waiver adjustment:\s*£[\d,]+(?:\.\d{1,2})?[^\n]*/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || null;
}

function buildAdjustmentCopy(players: ZeroFeeAdjustmentPlayer[]) {
  const totalPence = players.reduce((sum, player) => sum + player.amountPence, 0);
  const names = players.map((player) => player.name).join(", ");
  return `${ZERO_FEE_ADJUSTMENT_NOTE}: ${formatMoney(totalPence)} removed for ${names}.`;
}

async function getMarkedZeroFeeRows(input: {
  teamIds: string[];
  fixtureId?: string;
}) {
  return prisma.playerMatchFee.findMany({
    where: {
      teamId: { in: input.teamIds },
      ...(input.fixtureId ? { fixtureId: input.fixtureId } : {}),
      status: "WAIVED",
      note: { contains: ZERO_FEE_WAIVER_NOTE },
    },
    orderBy: [{ createdAt: "asc" }],
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
  });
}

async function reconcile(input: {
  teamIds: string[];
  fixtureId?: string;
}): Promise<ZeroFeeAdjustmentReconciliation> {
  const markedRows = await getMarkedZeroFeeRows(input);
  const membershipIds = markedRows
    .map((row) => row.teamMemberId)
    .filter((value): value is string => Boolean(value));
  const profiles = await getTeamMemberProfilesByTeamMemberIds(membershipIds);

  const rowsByTeamFixture = new Map<string, ZeroFeeFeeRow[]>();
  for (const row of markedRows) {
    const key = feeKey(row.teamId, row.fixtureId);
    const existing = rowsByTeamFixture.get(key) ?? [];
    existing.push(row);
    rowsByTeamFixture.set(key, existing);
  }

  const charges = await prisma.paymentCharge.findMany({
    where: {
      teamId: { in: input.teamIds },
      fixtureId: input.fixtureId ? input.fixtureId : { not: null },
      status: { not: "VOID" },
      OR: [
        { description: { contains: ZERO_FEE_ADJUSTMENT_NOTE } },
        ...(markedRows.length
          ? [{ fixtureId: { in: Array.from(new Set(markedRows.map((row) => row.fixtureId))) } }]
          : []),
      ],
    },
    select: {
      id: true,
      teamId: true,
      fixtureId: true,
      title: true,
      description: true,
      amountPence: true,
      fixture: {
        select: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  let changed = false;
  const changedChargeIds: string[] = [];
  const removedStaleAdjustmentChargeIds: string[] = [];
  const adjustments: ZeroFeeAdjustmentDetail[] = [];

  for (const charge of charges) {
    if (!charge.fixtureId) continue;

    const allMarkedRows = rowsByTeamFixture.get(feeKey(charge.teamId, charge.fixtureId)) ?? [];
    const validRows = allMarkedRows.filter((row) => {
      if (!row.teamMemberId) return false;
      return profiles.get(row.teamMemberId)?.playerMatchFeePenceOverride === 0;
    });
    const players: ZeroFeeAdjustmentPlayer[] = validRows
      .filter((row): row is ZeroFeeFeeRow & { teamMemberId: string } => Boolean(row.teamMemberId))
      .map((row) => ({
        playerMatchFeeId: row.id,
        teamMemberId: row.teamMemberId,
        name: getPlayerName(row),
        email: row.teamMember?.user.email ?? null,
        amountPence: row.amountPence,
      }));

    const currentAdjustmentPence = getMarkedAdjustmentPence(charge.description);
    const validAdjustmentPence = players.reduce(
      (sum, player) => sum + player.amountPence,
      0,
    );
    const baseAmountPence = charge.amountPence + currentAdjustmentPence;
    const nextAmountPence = Math.max(baseAmountPence - validAdjustmentPence, 0);
    const cleanDescription = removeOldAdjustmentCopy(charge.description);
    const nextDescription = players.length
      ? [cleanDescription, buildAdjustmentCopy(players)].filter(Boolean).join("\n")
      : cleanDescription;

    if (
      charge.amountPence !== nextAmountPence ||
      (charge.description ?? null) !== (nextDescription ?? null)
    ) {
      await prisma.paymentCharge.update({
        where: { id: charge.id },
        data: {
          amountPence: nextAmountPence,
          description: nextDescription,
        },
      });
      changed = true;
      changedChargeIds.push(charge.id);
      if (currentAdjustmentPence > 0 && validAdjustmentPence === 0) {
        removedStaleAdjustmentChargeIds.push(charge.id);
      }
    }

    if (players.length > 0) {
      adjustments.push({
        chargeId: charge.id,
        chargeTitle: charge.title,
        teamId: charge.teamId,
        fixtureId: charge.fixtureId,
        fixtureLabel: charge.fixture
          ? `${charge.fixture.homeTeam.name} vs ${charge.fixture.awayTeam.name}`
          : charge.title,
        amountPence: validAdjustmentPence,
        players,
      });
    }
  }

  return {
    changed,
    changedChargeIds,
    removedStaleAdjustmentChargeIds,
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
