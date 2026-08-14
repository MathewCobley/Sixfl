import { applyAvailableTeamCreditToCharge, getTeamCreditLedger } from "@/lib/payments/team-credits";
import { getRelatedTeamIdsForPaymentLedger } from "@/lib/payments/team-payment-ledger";
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
  try {
    const result = await applyAvailableTeamCreditToCharge({
      chargeId: input.chargeId,
      teamIds: before.relatedTeamIds,
      description:
        input.description?.trim() ||
        "Existing team credit automatically used before collecting more player money.",
    });
    amountUsedPence = result.amountUsedPence;
  } catch {
    // Some historical/managed-period charges are deliberately ineligible for
    // standard-team credit. Leave them unchanged and return the current policy.
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
