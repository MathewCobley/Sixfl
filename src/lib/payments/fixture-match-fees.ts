// ========================================
// File: src/lib/payments/fixture-match-fees.ts
// ========================================

import { randomBytes } from "node:crypto";
import {
  NotificationDispatchStatus,
  PaymentChargeStatus,
} from "@prisma/client";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
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
  homeMatchFeePence: number | null;
  awayMatchFeePence: number | null;
};

type PaymentChargeDbClient = Pick<
  typeof prisma,
  "paymentCharge" | "notificationDispatch"
>;

type PaymentChargeNotificationDbClient = Pick<
  typeof prisma,
  "notificationDispatch"
>;

type QueueFixtureMatchFeeEmailsInput = SyncFixtureMatchFeeChargesInput & {
  charges: Array<{
    id: string;
    teamId: string;
    teamName: string;
    teamLogoUrl: string | null;
    paymentToken: string | null;
    amountPence: number;
  }>;
  mode?: "all" | "reminders_only";
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

function getFixtureMatchFeeReminderSchedules(kickoffAt: Date) {
  return ([24, 72] as const)
    .map((hoursAfterKickoff) => ({
      hoursAfterKickoff,
      scheduledFor: new Date(
        kickoffAt.getTime() + hoursAfterKickoff * 60 * 60 * 1000,
      ),
    }))
    .filter((entry) => entry.scheduledFor.getTime() > Date.now());
}

export function buildChargePaymentPath(paymentToken: string) {
  return `/pay/charge/${paymentToken}`;
}

export function buildChargePaymentUrl(paymentToken: string) {
  return new URL(
    buildChargePaymentPath(paymentToken),
    `${getPublicSiteUrl()}/`,
  ).toString();
}

export async function cancelQueuedMatchFeeNotificationDispatches(
  chargeIds: string[],
  db: PaymentChargeNotificationDbClient = prisma,
  options?: {
    includeInitialRequest?: boolean;
    includeReminders?: boolean;
    reason?: string;
  },
) {
  if (chargeIds.length === 0) {
    return;
  }

  const includeInitialRequest = options?.includeInitialRequest ?? true;
  const includeReminders = options?.includeReminders ?? true;

  const sourceTypes = [
    ...(includeInitialRequest ? ["FIXTURE_MATCH_FEE"] : []),
    ...(includeReminders ? ["FIXTURE_MATCH_FEE_REMINDER"] : []),
  ];

  if (sourceTypes.length === 0) {
    return;
  }

  await db.notificationDispatch.updateMany({
    where: {
      sourceType: {
        in: sourceTypes,
      },
      sourceId: {
        in: chargeIds,
      },
      status: NotificationDispatchStatus.QUEUED,
    },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason:
        options?.reason?.trim() ||
        "Match fee charge no longer requires queued payment emails.",
    },
  });
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

  const desiredTeams = [
    ...(input.homeMatchFeePence && input.homeMatchFeePence > 0
      ? [
          {
            team: input.homeTeam,
            opponent: input.awayTeam,
            amountPence: input.homeMatchFeePence,
          },
        ]
      : []),
    ...(input.awayMatchFeePence && input.awayMatchFeePence > 0
      ? [
          {
            team: input.awayTeam,
            opponent: input.homeTeam,
            amountPence: input.awayMatchFeePence,
          },
        ]
      : []),
  ];

  const desiredTeamIds = new Set(desiredTeams.map((entry) => entry.team.id));
  const voidedChargeIds: string[] = [];

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

    voidedChargeIds.push(charge.id);
  }

  if (voidedChargeIds.length > 0) {
    await cancelQueuedMatchFeeNotificationDispatches(voidedChargeIds, db, {
      reason:
        "Match fee charge was changed or removed before queued payment emails were sent.",
    });
  }

  if (desiredTeams.length === 0) {
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

    if (existingCharges.length > 0) {
      await cancelQueuedMatchFeeNotificationDispatches(
        existingCharges.map((charge) => charge.id),
        db,
        {
          reason:
            "Match fee was removed before queued payment emails were sent.",
        },
      );
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
    amountPence: number;
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
          amountPence: entry.amountPence,
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
        amountPence: createdCharge.amountPence,
      });

      continue;
    }

    const paidTotalPence = getChargePaidTotal(existingCharge.transactions);

    if (paidTotalPence > 0 && existingCharge.amountPence !== entry.amountPence) {
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
        amountPence: entry.amountPence,
        dueDate: input.kickoffAt,
        status: getChargeStatusFromAmounts(entry.amountPence, paidTotalPence),
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
        amountPence: updatedCharge.amountPence,
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
  const canQueueEmail = Boolean(process.env.EMAIL_REPLY_DOMAIN?.trim());

  const leagueDisplayName = getLeagueDisplayName({
    leagueName: input.leagueName,
    leagueSeason: input.leagueSeason,
  });

  const shouldQueueInitialRequest = input.mode !== "reminders_only";

  let requestQueued = 0;
  let requestSkipped = 0;
  let reminderQueued = 0;
  let reminderSkipped = 0;

  for (const charge of input.charges) {
    if (!charge.paymentToken) {
      if (shouldQueueInitialRequest) {
        requestSkipped += 1;
      }
      continue;
    }

    const { recipient, snapshot } = await upsertTeamNotificationRecipient(
      charge.teamId,
    );

    if (shouldQueueInitialRequest) {
      if (canQueueEmail) {
        const requestDispatch = await queueNotificationFromTemplate({
          templateKey: "match-fee-due-email",
          recipientId: recipient.id,
          sourceType: "FIXTURE_MATCH_FEE",
          sourceId: charge.id,
          metadata: {
            kind: "fixture_match_fee_request",
            chargeId: charge.id,
            fixtureId: input.fixtureId,
            teamId: charge.teamId,
          },
          variables: {
            firstName: snapshot.primaryContact.name ?? charge.teamName,
            leagueName: input.leagueName,
            leagueDisplayName,
            fixtureName: `${input.homeTeam.name} vs ${input.awayTeam.name}`,
            kickoffLabel: formatKickoffLabel(input.kickoffAt),
            amount: formatMoney(charge.amountPence),
            paymentUrl: buildChargePaymentUrl(charge.paymentToken),
          },
          emailBranding: {
            teamName: charge.teamName,
            teamLogoUrl: charge.teamLogoUrl,
            leagueName: leagueDisplayName,
          },
          paymentSummary: {
            amount: formatMoney(charge.amountPence),
            reason: `${input.homeTeam.name} vs ${input.awayTeam.name}`,
          },
        });

        if (requestDispatch.status === NotificationDispatchStatus.QUEUED) {
          requestQueued += 1;
        } else {
          requestSkipped += 1;
        }
      }

      const requestSmsDispatch = await queueNotificationFromTemplate({
        templateKey: "match-fee-due-sms",
        recipientId: recipient.id,
        sourceType: "FIXTURE_MATCH_FEE",
        sourceId: charge.id,
        metadata: {
          kind: "fixture_match_fee_request_sms",
          chargeId: charge.id,
          fixtureId: input.fixtureId,
          teamId: charge.teamId,
        },
        variables: {
          firstName: snapshot.primaryContact.name ?? charge.teamName,
          leagueName: input.leagueName,
          leagueDisplayName,
          fixtureName: `${input.homeTeam.name} vs ${input.awayTeam.name}`,
          kickoffLabel: formatKickoffLabel(input.kickoffAt),
          amount: formatMoney(charge.amountPence),
          paymentUrl: buildChargePaymentUrl(charge.paymentToken),
        },
      });

      if (requestSmsDispatch.status === NotificationDispatchStatus.QUEUED) {
        requestQueued += 1;
      } else {
        requestSkipped += 1;
      }
    }

    const reminderSchedules = getFixtureMatchFeeReminderSchedules(input.kickoffAt);

    for (const reminder of reminderSchedules) {
      if (canQueueEmail) {
        const reminderDispatch = await queueNotificationFromTemplate({
          templateKey: "match-fee-reminder-email",
          recipientId: recipient.id,
          sourceType: "FIXTURE_MATCH_FEE_REMINDER",
          sourceId: charge.id,
          metadata: {
            kind: "fixture_match_fee_reminder",
            chargeId: charge.id,
            fixtureId: input.fixtureId,
            teamId: charge.teamId,
            reminderOffsetHours: reminder.hoursAfterKickoff,
          },
          scheduledFor: reminder.scheduledFor,
          variables: {
            firstName: snapshot.primaryContact.name ?? charge.teamName,
            leagueName: input.leagueName,
            leagueDisplayName,
            fixtureName: `${input.homeTeam.name} vs ${input.awayTeam.name}`,
            kickoffLabel: formatKickoffLabel(input.kickoffAt),
            paymentUrl: buildChargePaymentUrl(charge.paymentToken),
            reminderIntro:
              reminder.hoursAfterKickoff === 24
                ? "Your match fee for the fixture below is still unpaid."
                : "Your match fee for the fixture below is still unpaid after our earlier reminder.",
          },
          emailBranding: {
            teamName: charge.teamName,
            teamLogoUrl: charge.teamLogoUrl,
            leagueName: leagueDisplayName,
          },
        });

        if (reminderDispatch.status === NotificationDispatchStatus.QUEUED) {
          reminderQueued += 1;
        } else {
          reminderSkipped += 1;
        }
      }

      const reminderSmsDispatch = await queueNotificationFromTemplate({
        templateKey: "match-fee-reminder-sms",
        recipientId: recipient.id,
        sourceType: "FIXTURE_MATCH_FEE_REMINDER",
        sourceId: charge.id,
        metadata: {
          kind: "fixture_match_fee_reminder_sms",
          chargeId: charge.id,
          fixtureId: input.fixtureId,
          teamId: charge.teamId,
          reminderOffsetHours: reminder.hoursAfterKickoff,
        },
        scheduledFor: reminder.scheduledFor,
        variables: {
          firstName: snapshot.primaryContact.name ?? charge.teamName,
          leagueName: input.leagueName,
          leagueDisplayName,
          fixtureName: `${input.homeTeam.name} vs ${input.awayTeam.name}`,
          kickoffLabel: formatKickoffLabel(input.kickoffAt),
          paymentUrl: buildChargePaymentUrl(charge.paymentToken),
          reminderIntro:
            reminder.hoursAfterKickoff === 24
              ? "Your match fee is still unpaid."
              : "Your match fee is still unpaid after our earlier reminder.",
        },
      });

      if (reminderSmsDispatch.status === NotificationDispatchStatus.QUEUED) {
        reminderQueued += 1;
      } else {
        reminderSkipped += 1;
      }
    }
  }

  return {
    queued: requestQueued + reminderQueued,
    skipped: requestSkipped + reminderSkipped,
    requestQueued,
    requestSkipped,
    reminderQueued,
    reminderSkipped,
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

    await cancelQueuedMatchFeeNotificationDispatches(
      charges.map((charge) => charge.id),
      db,
      {
        reason: "Fixture was deleted before queued match fee emails were sent.",
      },
    );
  }
}
