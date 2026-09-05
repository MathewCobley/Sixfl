import { applyAvailableTeamCreditToCharge, getTeamCreditLedger } from "@/lib/payments/team-credits";
import { getRelatedTeamIdsForPaymentLedger } from "@/lib/payments/team-payment-ledger";
import { getTeamPaymentOrder } from "@/lib/payments/team-payment-order";
import { prisma } from "@/lib/prisma";

export type TeamCreditPolicySnapshot = {
  teamId: string;
  relatedTeamIds: string[];
  enabled: boolean;
  fixtureFeePence: number;
  creditCapPence: number;
  creditBalancePence: number;
  creditHeadroomPence: number;
};

function positivePence(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

export async function getTeamCreditPolicySnapshot(input: {
  teamId: string;
  fixtureFeePence: number;
}): Promise<TeamCreditPolicySnapshot> {
  const fixtureFeePence = positivePence(input.fixtureFeePence);
  const identity = await getRelatedTeamIdsForPaymentLedger(input.teamId);
  const relatedTeamIds = identity?.relatedTeamIds ?? [input.teamId];
  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: {
      id: true,
      teamMode: true,
      standardMatchFeePence: true,
    },
  });

  if (!team || team.teamMode !== "STANDARD") {
    return {
      teamId: input.teamId,
      relatedTeamIds,
      enabled: false,
      fixtureFeePence,
      creditCapPence: 0,
      creditBalancePence: 0,
      creditHeadroomPence: 0,
    };
  }

  const creditLedger = await getTeamCreditLedger(relatedTeamIds);
  const creditBalancePence = Math.max(creditLedger.balancePence, 0);
  const creditCapPence =
    positivePence(team.standardMatchFeePence) || fixtureFeePence;

  return {
    teamId: team.id,
    relatedTeamIds,
    enabled: creditCapPence > 0,
    fixtureFeePence,
    creditCapPence,
    creditBalancePence,
    creditHeadroomPence: Math.max(creditCapPence - creditBalancePence, 0),
  };
}

export async function applyExistingTeamCreditToChargeFirst(input: {
  teamId: string;
  chargeId: string;
  fixtureFeePence: number;
  description?: string;
}) {
  const before = await getTeamCreditPolicySnapshot({
    teamId: input.teamId,
    fixtureFeePence: input.fixtureFeePence,
  });

  if (!before.enabled || before.creditBalancePence <= 0) {
    return {
      amountUsedPence: 0,
      policy: before,
    };
  }

  let amountUsedPence = 0;
  // This is unallocated team credit, not the players' fixture-specific money.
  // Apply it in due-date order, and report only credit applied to the caller's
  // fixture so squad collection calculations cannot attribute older settlement
  // to the current game.
  for (let step = 0; step < 20; step++) {
    const order = await getTeamPaymentOrder(input.teamId);
    const target = order.enabled ? order.next : order.ledger.entries.find(entry => entry.chargeId === input.chargeId);
    const requested = order.ledger.entries.find(entry => entry.chargeId === input.chargeId);
    const targetDate = target ? (target.dueDate ?? target.kickoffAt ?? target.createdAt).getTime() : Infinity;
    const requestedDate = requested ? (requested.dueDate ?? requested.kickoffAt ?? requested.createdAt).getTime() : -Infinity;
    if (!requested || !target || target.outstandingPence <= 0 || targetDate > requestedDate) break;
    try {
      const result = await applyAvailableTeamCreditToCharge({
        chargeId: target.chargeId,
        teamIds: before.relatedTeamIds,
        description: target.chargeId === input.chargeId
          ? input.description?.trim() || `Existing team credit used against ${target.title}.`
          : `Unallocated team credit used against oldest outstanding charge: ${target.title}.`,
      });
      if (target.chargeId === input.chargeId) amountUsedPence += result.amountUsedPence;
      if (result.amountUsedPence <= 0 || result.remainingCreditPence <= 0 || target.chargeId === input.chargeId) break;
    } catch {
      // Fail closed: never jump over an ineligible/held charge and silently
      // consume the same credit against a newer fixture.
      break;
    }
  }

  return {
    amountUsedPence,
    policy: await getTeamCreditPolicySnapshot({
      teamId: input.teamId,
      fixtureFeePence: input.fixtureFeePence,
    }),
  };
}

export function getMaximumAdditionalCollectionPence(input: {
  outstandingFixturePence: number;
  creditHeadroomPence: number;
}) {
  return (
    Math.max(Math.round(input.outstandingFixturePence), 0) +
    Math.max(Math.round(input.creditHeadroomPence), 0)
  );
}
