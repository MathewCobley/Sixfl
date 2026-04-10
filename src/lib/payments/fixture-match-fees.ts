// ========================================
// File: src/lib/payments/fixture-match-fees.ts
// ========================================

import { randomBytes } from "node:crypto";
import {
  NotificationAudience,
  NotificationChannel,
  PaymentChargeStatus,
} from "@prisma/client";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { getPublicSiteUrl } from "@/lib/stripe/client";
import {
  getChargePaidTotal,
  getChargeStatusFromAmounts,
} from "@/lib/payments/charge-status";

type FixtureMatchFeeTeam = {
  id: string;
  name: string;
  logoUrl?: string | null;
};

type SyncFixtureMatchFeeChargesInput = {
  db?: PaymentChargeDbClient;
  fixtureId: string;
  leagueId: string;
  leagueName: string;
  leagueSeason?: string | null;
  kickoffAt: Date;
  homeTeam: FixtureMatchFeeTeam;
  awayTeam: FixtureMatchFeeTeam;
  matchFeePence: number | null;
};

type PaymentChargeDbClient = Pick<typeof prisma, "paymentCharge">;

type QueueFixtureMatchFeeEmailsInput = SyncFixtureMatchFeeChargesInput & {
  charges: Array<{
    id: string;
    teamId: string;
    teamName: string;
    teamLogoUrl: string | null;
    paymentToken: string | null;
  }>;
};

function createPaymentToken() {
  return randomBytes(24).toString("hex");
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatKickoffLabel(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLeagueDisplayName(input: {
  leagueName: string;
  leagueSeason?: string | null;
}) {
  return input.leagueSeason
    ? `${input.leagueName} — ${input.leagueSeason}`
    : input.leagueName;
}

function buildChargeTitle(input: {
  teamName: string;
  opponentName: string;
}) {
  return `Match fee • ${input.teamName} vs ${input.opponentName}`;
}

function buildChargeDescription(input: {
  leagueName: string;
  leagueSeason?: string | null;
  kickoffAt: Date;
}) {
  return `${getLeagueDisplayName(input)} • ${formatKickoffLabel(input.kickoffAt)}`;
}

export function buildChargePaymentPath(paymentToken: string) {
  return `/pay/charge/${paymentToken}`;
}

export function buildChargePaymentUrl(paymentToken: string) {
  return new URL(buildChargePaymentPath(paymentToken), `${getPublicSiteUrl()}/`).toString();
}

export async function syncFixtureMatchFeeCharges(
  input: SyncFixtureMatchFeeChargesInput,
) {
  const db = input.db ?? prisma;

  const existingCharges = await db.paymentCharge.findMany({
    where: {
      fixtureId: input.fixtureId,
    },
    include: {
      transactions: {
        select: {
          amountPence: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const desiredFee = input.matchFeePence && input.matchFeePence > 0 ? input.matchFeePence : null;
  const desiredTeams = desiredFee
    ? [
        {
          team: input.homeTeam,
          opponent: input.awayTeam,
        },
        {
          team: input.awayTeam,
          opponent: input.homeTeam,
        },
      ]
    : [];
  const desiredTeamIds = new Set(desiredTeams.map((entry) => entry.team.id));

  for (const charge of existingCharges) {
    if (desiredTeamIds.has(charge.teamId)) {
      continue;
    }

    const paidTotalPence = getChargePaidTotal(charge.transactions);

    if (paidTotalPence > 0) {
      throw new Error(
        `Cannot change the teams on this fixture because ${charge.team.name} already has a recorded match fee payment.`,
      );
    }

    await db.paymentCharge.update({
      where: { id: charge.id },
      data: {
        status: PaymentChargeStatus.VOID,
      },
    });
  }

  if (!desiredFee) {
    for (const charge of existingCharges) {
      const paidTotalPence = getChargePaidTotal(charge.transactions);

      if (paidTotalPence > 0) {
        throw new Error(
          `Cannot remove the match fee because ${charge.team.name} already has a recorded payment.`,
        );
      }

      await db.paymentCharge.update({
        where: { id: charge.id },
        data: {
          status: PaymentChargeStatus.VOID,
        },
      });
    }

    return {
      activeCharges: [],
    };
  }

  const activeCharges: Array<{
    id: string;
    teamId: string;
    teamName: string;
    teamLogoUrl: string | null;
    paymentToken: string | null;
  }> = [];

  for (const entry of desiredTeams) {
    const existingCharge = existingCharges.find(
      (charge) => charge.teamId === entry.team.id,
    );

    const title = buildChargeTitle({
      teamName: entry.team.name,
      opponentName: entry.opponent.name,
    });
    const description = buildChargeDescription({
      leagueName: input.leagueName,
      leagueSeason: input.leagueSeason,
      kickoffAt: input.kickoffAt,
    });

    if (!existingCharge) {
      const createdCharge = await db.paymentCharge.create({
        data: {
          teamId: entry.team.id,
          leagueId: input.leagueId,
          fixtureId: input.fixtureId,
          title,
          description,
          amountPence: desiredFee,
          dueDate: input.kickoffAt,
          status: PaymentChargeStatus.OPEN,
          paymentToken: createPaymentToken(),
        },
      });

      activeCharges.push({
        id: createdCharge.id,
        teamId: entry.team.id,
        teamName: entry.team.name,
        teamLogoUrl: entry.team.logoUrl ?? null,
        paymentToken: createdCharge.paymentToken,
      });

      continue;
    }

    const paidTotalPence = getChargePaidTotal(existingCharge.transactions);

    if (
      paidTotalPence > 0 &&
      existingCharge.amountPence !== desiredFee
    ) {
      throw new Error(
        `Cannot change the match fee amount for ${existingCharge.team.name} because a payment has already been recorded.`,
      );
    }

    const updatedCharge = await db.paymentCharge.update({
      where: { id: existingCharge.id },
      data: {
        teamId: entry.team.id,
        leagueId: input.leagueId,
        fixtureId: input.fixtureId,
        title,
        description,
        amountPence: desiredFee,
        dueDate: input.kickoffAt,
        status: getChargeStatusFromAmounts(desiredFee, paidTotalPence),
        paymentToken: existingCharge.paymentToken ?? createPaymentToken(),
      },
    });

    if (updatedCharge.status !== PaymentChargeStatus.VOID) {
      activeCharges.push({
        id: updatedCharge.id,
        teamId: entry.team.id,
        teamName: entry.team.name,
        teamLogoUrl: entry.team.logoUrl ?? null,
        paymentToken: updatedCharge.paymentToken,
      });
    }
  }

  return {
    activeCharges,
  };
}

export async function queueFixtureMatchFeeEmails(
  input: QueueFixtureMatchFeeEmailsInput,
) {
  if (!process.env.EMAIL_REPLY_DOMAIN?.trim()) {
    return {
      queued: 0,
      skipped: input.charges.length,
    };
  }

  const leagueDisplayName = getLeagueDisplayName({
    leagueName: input.leagueName,
    leagueSeason: input.leagueSeason,
  });

  let queued = 0;
  let skipped = 0;

  for (const charge of input.charges) {
    if (!charge.paymentToken) {
      skipped += 1;
      continue;
    }

    const { recipient, snapshot } = await upsertTeamNotificationRecipient(charge.teamId);

    const dispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.TEAM,
      subject: `${input.leagueName} match fee due`,
      body: [
        `Hi ${snapshot.primaryContact.name ?? charge.teamName},`,
        "",
        `A match fee has been raised for your upcoming SIXFL fixture.`,
        "",
        `Fixture: ${input.homeTeam.name} vs ${input.awayTeam.name}`,
        `Kickoff: ${formatKickoffLabel(input.kickoffAt)}`,
        `Amount due: ${formatMoney(input.matchFeePence ?? 0)}`,
        "",
        "Use the secure payment link below to review the charge and pay online.",
      ].join("\n"),
      isTransactional: true,
      sourceType: "FIXTURE_MATCH_FEE",
      sourceId: charge.id,
      metadata: {
        kind: "fixture_match_fee_request",
        chargeId: charge.id,
        fixtureId: input.fixtureId,
        teamId: charge.teamId,
      },
      emailBranding: {
        teamName: charge.teamName,
        teamLogoUrl: charge.teamLogoUrl,
        leagueName: leagueDisplayName,
      },
      emailCta: {
        label: "Review & pay match fee",
        url: buildChargePaymentUrl(charge.paymentToken),
      },
      paymentSummary: {
        amount: formatMoney(input.matchFeePence ?? 0),
        reason: `${input.homeTeam.name} vs ${input.awayTeam.name}`,
      },
    });

    if (dispatch.status === "QUEUED") {
      queued += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    queued,
    skipped,
  };
}

export async function voidFixtureMatchFeeChargesOrThrow(
  fixtureIds: string[],
  db: PaymentChargeDbClient = prisma,
) {
  if (fixtureIds.length === 0) {
    return;
  }

  const charges = await db.paymentCharge.findMany({
    where: {
      fixtureId: {
        in: fixtureIds,
      },
    },
    include: {
      transactions: {
        select: {
          amountPence: true,
        },
      },
      team: {
        select: {
          name: true,
        },
      },
    },
  });

  for (const charge of charges) {
    const paidTotalPence = getChargePaidTotal(charge.transactions);

    if (paidTotalPence > 0) {
      throw new Error(
        `Cannot delete this fixture because ${charge.team.name} already has a recorded match fee payment.`,
      );
    }
  }

  if (charges.length > 0) {
    await db.paymentCharge.updateMany({
      where: {
        id: {
          in: charges.map((charge) => charge.id),
        },
      },
      data: {
        status: PaymentChargeStatus.VOID,
      },
    });
  }
}
