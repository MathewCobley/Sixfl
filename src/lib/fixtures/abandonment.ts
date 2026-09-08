import { randomBytes, randomUUID } from "node:crypto";
import {
  FixtureStatus,
  NotificationChannel,
  PaymentChargeStatus,
  Prisma,
} from "@prisma/client";

import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";
import {
  getDirectChargePaidTotal,
} from "@/lib/payments/charge-summary";
import { getPlayerFeeCashReceivedPence } from "@/lib/payments/player-fee-coverage";
import {
  buildChargePaymentUrl,
  cancelQueuedMatchFeeNotificationDispatches,
} from "@/lib/payments/fixture-match-fees";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { prisma } from "@/lib/prisma";

export const FIXTURE_ABANDONMENT_REASONS = [
  {
    value: "REFUSED_TO_LEAVE",
    label: "Player / manager refused to leave after referee instruction",
    teamResponsible: true,
  },
  {
    value: "TEAM_CONDUCT",
    label: "Conduct of one team made the match impossible to continue",
    teamResponsible: true,
  },
  {
    value: "VIOLENT_OR_THREATENING_CONDUCT",
    label: "Violent, threatening or aggressive conduct",
    teamResponsible: true,
  },
  {
    value: "SERIOUS_MISCONDUCT",
    label: "Other serious player / manager misconduct",
    teamResponsible: true,
  },
  {
    value: "MEDICAL_EMERGENCY",
    label: "Medical emergency / serious injury",
    teamResponsible: false,
  },
  {
    value: "VENUE_OR_PITCH_SAFETY",
    label: "Venue / pitch safety issue",
    teamResponsible: false,
  },
  {
    value: "WEATHER",
    label: "Weather conditions",
    teamResponsible: false,
  },
  {
    value: "OTHER",
    label: "Other reason",
    teamResponsible: false,
  },
] as const;

export type FixtureAbandonmentReason =
  (typeof FIXTURE_ABANDONMENT_REASONS)[number]["value"];

export type FixtureAbandonmentRow = {
  id: string;
  fixtureId: string;
  refereeNightId: string | null;
  reason: string;
  responsibleTeamId: string | null;
  innocentTeamId: string | null;
  details: string | null;
  responsibleOriginalFeePence: number | null;
  innocentOriginalFeePence: number | null;
  responsibleFinalChargePence: number | null;
  innocentPaidPence: number;
  innocentCreditPence: number;
  homeScoreAtAbandonment: number | null;
  awayScoreAtAbandonment: number | null;
  recordedAt: Date;
};

function formatMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function getReason(reason: string) {
  return FIXTURE_ABANDONMENT_REASONS.find((item) => item.value === reason) ?? null;
}

export function getFixtureAbandonmentReasonLabel(reason: string) {
  return getReason(reason)?.label ?? "Other reason";
}

function getPlayerPaidPence(input: {
  fixtureId: string;
  teamId: string;
  fees: Array<{
    fixtureId: string;
    teamId: string;
    amountPence: number;
    status: string;
    note: string | null;
  }>;
}) {
  return input.fees
    .filter(
      (fee) =>
        fee.fixtureId === input.fixtureId &&
        fee.teamId === input.teamId &&
        fee.status === "PAID",
    )
    .reduce(
      (sum, fee) =>
        sum +
        getPlayerFeeCashReceivedPence({
          amountPence: fee.amountPence,
          status: fee.status,
          note: fee.note,
        }),
      0,
    );
}

function getPaidPence(input: {
  fixtureId: string;
  teamId: string;
  charge:
    | {
        transactions: Array<{ amountPence: number; notes: string | null }>;
      }
    | null
    | undefined;
  fees: Array<{
    fixtureId: string;
    teamId: string;
    amountPence: number;
    status: string;
    note: string | null;
  }>;
}) {
  const direct = input.charge
    ? getDirectChargePaidTotal(input.charge.transactions)
    : 0;
  const players = getPlayerPaidPence({
    fixtureId: input.fixtureId,
    teamId: input.teamId,
    fees: input.fees,
  });
  return direct + players;
}

function statusFor(amountPence: number, paidPence: number) {
  if (amountPence <= 0) return PaymentChargeStatus.PAID;
  if (paidPence >= amountPence) return PaymentChargeStatus.PAID;
  if (paidPence > 0) return PaymentChargeStatus.PART_PAID;
  return PaymentChargeStatus.OPEN;
}

function createPaymentToken() {
  return randomBytes(24).toString("hex");
}

export async function getFixtureAbandonments(fixtureIdsInput: string[]) {
  const fixtureIds = Array.from(new Set(fixtureIdsInput.filter(Boolean)));
  if (fixtureIds.length === 0) return new Map<string, FixtureAbandonmentRow>();

  const rows = await prisma.$queryRaw<FixtureAbandonmentRow[]>(Prisma.sql`
    SELECT
      "id",
      "fixtureId",
      "refereeNightId",
      "reason",
      "responsibleTeamId",
      "innocentTeamId",
      "details",
      "responsibleOriginalFeePence",
      "innocentOriginalFeePence",
      "responsibleFinalChargePence",
      "innocentPaidPence",
      "innocentCreditPence",
      "homeScoreAtAbandonment",
      "awayScoreAtAbandonment",
      "recordedAt"
    FROM "FixtureAbandonment"
    WHERE "fixtureId" IN (${Prisma.join(fixtureIds)})
  `);

  return new Map(rows.map((row) => [row.fixtureId, row]));
}

export async function recordFixtureAbandonment(input: {
  fixtureId: string;
  refereeNightId?: string | null;
  reason: string;
  responsibleTeamId?: string | null;
  details?: string | null;
  recordedByUserId: string;
}) {
  const reason = getReason(input.reason);
  if (!reason) throw new Error("Choose a valid abandonment reason.");

  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "FixtureAbandonment"
    WHERE "fixtureId" = ${input.fixtureId}
    LIMIT 1
  `);
  if (existing[0]) {
    throw new Error("This fixture is already marked as abandoned.");
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: input.fixtureId },
    include: {
      league: { select: { id: true, name: true, season: true } },
      homeTeam: {
        select: {
          id: true,
          name: true,
          teamMode: true,
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          teamMode: true,
        },
      },
      result: {
        select: { homeScore: true, awayScore: true },
      },
      paymentCharges: {
        include: {
          transactions: {
            select: { amountPence: true, notes: true },
          },
        },
      },
    },
  });

  if (!fixture) throw new Error("Fixture not found.");

  const teamIds = [fixture.homeTeam.id, fixture.awayTeam.id];
  const responsibleTeamId = input.responsibleTeamId?.trim() || null;

  if (reason.teamResponsible && !responsibleTeamId) {
    throw new Error("Choose the team whose conduct caused the abandonment.");
  }
  if (responsibleTeamId && !teamIds.includes(responsibleTeamId)) {
    throw new Error("The responsible team must be one of the teams in this fixture.");
  }

  const responsibleTeam = responsibleTeamId
    ? responsibleTeamId === fixture.homeTeam.id
      ? fixture.homeTeam
      : fixture.awayTeam
    : null;
  const innocentTeam = responsibleTeam
    ? responsibleTeam.id === fixture.homeTeam.id
      ? fixture.awayTeam
      : fixture.homeTeam
    : null;

  const playerFees = await prisma.playerMatchFee.findMany({
    where: {
      fixtureId: fixture.id,
      teamId: { in: teamIds },
    },
    select: {
      fixtureId: true,
      teamId: true,
      amountPence: true,
      status: true,
      note: true,
    },
  });

  const chargeByTeam = new Map(
    fixture.paymentCharges.map((charge) => [charge.teamId, charge]),
  );

  const responsibleCharge = responsibleTeam
    ? chargeByTeam.get(responsibleTeam.id) ?? null
    : null;
  const innocentCharge = innocentTeam
    ? chargeByTeam.get(innocentTeam.id) ?? null
    : null;

  const responsibleOriginalFeePence = responsibleTeam
    ? responsibleCharge?.amountPence ?? fixture.matchFeePence ?? 0
    : null;
  const innocentOriginalFeePence = innocentTeam
    ? innocentCharge?.amountPence ?? fixture.matchFeePence ?? 0
    : null;

  const responsiblePaidPence = responsibleTeam
    ? getPaidPence({
        fixtureId: fixture.id,
        teamId: responsibleTeam.id,
        charge: responsibleCharge,
        fees: playerFees,
      })
    : 0;
  const innocentPaidPence = innocentTeam
    ? getPaidPence({
        fixtureId: fixture.id,
        teamId: innocentTeam.id,
        charge: innocentCharge,
        fees: playerFees,
      })
    : 0;

  const responsibleFinalChargePence =
    reason.teamResponsible && responsibleTeam && innocentTeam
      ? (responsibleOriginalFeePence ?? 0) + (innocentOriginalFeePence ?? 0)
      : null;
  const innocentCreditPence =
    reason.teamResponsible && innocentTeam?.teamMode === "STANDARD"
      ? innocentPaidPence
      : 0;

  let updatedResponsibleCharge:
    | { id: string; paymentToken: string | null; amountPence: number }
    | null = null;
  let innocentFeeOutcome = "No automatic fee change was made.";

  await prisma.$transaction(async (tx) => {
    if (reason.teamResponsible && responsibleTeam && innocentTeam) {
      const finalResponsibleAmount = responsibleFinalChargePence ?? 0;
      const paymentToken = responsibleCharge?.paymentToken || createPaymentToken();

      updatedResponsibleCharge = await tx.paymentCharge.upsert({
        where: {
          fixtureId_teamId: {
            fixtureId: fixture.id,
            teamId: responsibleTeam.id,
          },
        },
        update: {
          amountPence: finalResponsibleAmount,
          title: `Abandoned match fees • ${responsibleTeam.name} vs ${innocentTeam.name}`,
          description: `${responsibleTeam.name} is responsible for both match fees following a referee-abandoned fixture.`,
          paymentToken,
          status: statusFor(finalResponsibleAmount, responsiblePaidPence),
        },
        create: {
          teamId: responsibleTeam.id,
          leagueId: fixture.leagueId,
          fixtureId: fixture.id,
          title: `Abandoned match fees • ${responsibleTeam.name} vs ${innocentTeam.name}`,
          description: `${responsibleTeam.name} is responsible for both match fees following a referee-abandoned fixture.`,
          amountPence: finalResponsibleAmount,
          dueDate: fixture.kickoffAt,
          paymentToken,
          status: statusFor(finalResponsibleAmount, responsiblePaidPence),
        },
        select: { id: true, paymentToken: true, amountPence: true },
      });

      await tx.playerMatchFee.updateMany({
        where: {
          fixtureId: fixture.id,
          teamId: innocentTeam.id,
          status: "OPEN",
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });

      if (innocentCharge) {
        if (innocentPaidPence <= 0) {
          await tx.paymentCharge.update({
            where: { id: innocentCharge.id },
            data: {
              status: PaymentChargeStatus.VOID,
              description: "Match fee waived because the opposing team caused the fixture to be abandoned.",
            },
          });
          innocentFeeOutcome = "Their match fee was waived because no payment had been received.";
        } else {
          await tx.paymentCharge.update({
            where: { id: innocentCharge.id },
            data: {
              amountPence: innocentPaidPence,
              status: PaymentChargeStatus.PAID,
              description: "Match fee neutralised by team credit because the opposing team caused the fixture to be abandoned.",
            },
          });
          innocentFeeOutcome =
            innocentTeam.teamMode === "STANDARD"
              ? `${formatMoney(innocentPaidPence)} already paid was returned as team credit.`
              : `${formatMoney(innocentPaidPence)} had already been paid; SIXFL must account for that payment manually because this is not a standard team.`;
        }
      } else {
        innocentFeeOutcome = "Their match fee was waived; no charge existed to collect.";
      }

      if (innocentCreditPence > 0) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "TeamCreditLedgerEntry" (
            "id",
            "teamId",
            "sourceFixtureId",
            "chargeId",
            "entryType",
            "amountPence",
            "description",
            "createdAt"
          ) VALUES (
            ${`tcred_abandonment_${fixture.id}_${innocentTeam.id}`},
            ${innocentTeam.id},
            ${fixture.id},
            ${innocentCharge?.id ?? null},
            'CREDIT_ADDED'::"TeamCreditLedgerEntryType",
            ${innocentCreditPence},
            ${`Credit for match abandoned because of ${responsibleTeam.name}'s conduct.`},
            NOW()
          )
          ON CONFLICT ("id") DO UPDATE SET
            "amountPence" = EXCLUDED."amountPence",
            "description" = EXCLUDED."description"
        `);
      }
    }

    if (fixture.result) {
      await tx.matchResult.delete({ where: { fixtureId: fixture.id } });
    }

    await tx.fixture.update({
      where: { id: fixture.id },
      data: { status: FixtureStatus.CANCELLED },
    });

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "FixtureAbandonment" (
        "id",
        "fixtureId",
        "refereeNightId",
        "reason",
        "responsibleTeamId",
        "innocentTeamId",
        "details",
        "responsibleOriginalFeePence",
        "innocentOriginalFeePence",
        "responsibleFinalChargePence",
        "innocentPaidPence",
        "innocentCreditPence",
        "homeScoreAtAbandonment",
        "awayScoreAtAbandonment",
        "recordedByUserId",
        "recordedAt",
        "updatedAt"
      ) VALUES (
        ${randomUUID()},
        ${fixture.id},
        ${input.refereeNightId ?? null},
        ${reason.value},
        ${responsibleTeam?.id ?? null},
        ${innocentTeam?.id ?? null},
        ${input.details?.trim() || null},
        ${responsibleOriginalFeePence},
        ${innocentOriginalFeePence},
        ${responsibleFinalChargePence},
        ${innocentPaidPence},
        ${innocentCreditPence},
        ${fixture.result?.homeScore ?? null},
        ${fixture.result?.awayScore ?? null},
        ${input.recordedByUserId},
        NOW(),
        NOW()
      )
    `);
  });

  const chargeIds = fixture.paymentCharges.map((charge) => charge.id);
  if (updatedResponsibleCharge?.id && !chargeIds.includes(updatedResponsibleCharge.id)) {
    chargeIds.push(updatedResponsibleCharge.id);
  }
  await cancelQueuedMatchFeeNotificationDispatches(chargeIds, prisma, {
    reason: "Fixture was abandoned and the match-fee liability was recalculated by SIXFL.",
  });

  const reasonLabel = reason.label;
  const fixtureLabel = `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`;
  const dispatchIds: string[] = [];

  if (reason.teamResponsible && responsibleTeam && innocentTeam) {
    const total = responsibleFinalChargePence ?? 0;
    const outstanding = Math.max(0, total - responsiblePaidPence);
    const payUrl =
      outstanding > 0 && updatedResponsibleCharge?.paymentToken
        ? buildChargePaymentUrl(updatedResponsibleCharge.paymentToken)
        : null;

    const responsibleMessage = [
      "Hi {{firstName}},",
      "",
      `The referee abandoned ${fixtureLabel}.`,
      `Reason: ${reasonLabel}.`,
      input.details?.trim() ? `Referee note: ${input.details.trim()}` : null,
      "",
      `Under the SIXFL abandoned-match rule, ${responsibleTeam.name} is responsible for both its own match fee (${formatMoney(responsibleOriginalFeePence ?? 0)}) and ${innocentTeam.name}'s match fee (${formatMoney(innocentOriginalFeePence ?? 0)}).`,
      `Total charge: ${formatMoney(total)}. Amount already covered: ${formatMoney(responsiblePaidPence)}. Outstanding: ${formatMoney(outstanding)}.`,
      "",
      "The league/result outcome is separate and will be decided by SIXFL after reviewing the abandonment.",
      "",
      payUrl ? "Use the button below to pay the outstanding balance." : "No further payment is currently outstanding.",
      "",
      "SIXFL",
    ].filter(Boolean).join("\n");

    const responsibleDispatch = await sendTeamBroadcastMessage({
      teamId: responsibleTeam.id,
      channel: NotificationChannel.EMAIL,
      subject: `Match abandoned: fee decision for ${fixtureLabel}`,
      body: responsibleMessage,
      ctaLabel: payUrl ? "Pay outstanding match fees" : null,
      ctaUrl: payUrl,
      origin: "fixture-abandonment-fee-decision",
      originLabel: "Abandoned match fee decision",
      metadata: {
        fixtureId: fixture.id,
        role: "responsible_team",
        reason: reason.value,
        totalChargePence: total,
        outstandingPence: outstanding,
      },
      createdByUserId: input.recordedByUserId,
    });
    dispatchIds.push(responsibleDispatch.dispatchId);

    const innocentMessage = [
      "Hi {{firstName}},",
      "",
      `The referee abandoned ${fixtureLabel}.`,
      `Reason: ${reasonLabel}.`,
      "",
      `SIXFL has recorded ${responsibleTeam.name} as the team responsible for the abandonment. You will not be charged for this fixture.`,
      innocentPaidPence > 0
        ? innocentCreditPence > 0
          ? `${formatMoney(innocentCreditPence)} that had already been paid has been added to ${innocentTeam.name}'s SIXFL team credit for a future match.`
          : `${formatMoney(innocentPaidPence)} had already been paid. SIXFL will account for that payment separately.`
        : "No payment is due from your team for this abandoned fixture.",
      "",
      "The league/result outcome is separate and will be decided by SIXFL after reviewing the abandonment.",
      "",
      "SIXFL",
    ].join("\n");

    const innocentDispatch = await sendTeamBroadcastMessage({
      teamId: innocentTeam.id,
      channel: NotificationChannel.EMAIL,
      subject: `Match abandoned: your fee has been waived for ${fixtureLabel}`,
      body: innocentMessage,
      origin: "fixture-abandonment-fee-decision",
      originLabel: "Abandoned match fee decision",
      metadata: {
        fixtureId: fixture.id,
        role: "innocent_team",
        reason: reason.value,
        paidPence: innocentPaidPence,
        creditPence: innocentCreditPence,
      },
      createdByUserId: input.recordedByUserId,
    });
    dispatchIds.push(innocentDispatch.dispatchId);
  } else {
    for (const team of [fixture.homeTeam, fixture.awayTeam]) {
      const dispatch = await sendTeamBroadcastMessage({
        teamId: team.id,
        channel: NotificationChannel.EMAIL,
        subject: `Match abandoned: ${fixtureLabel}`,
        body: [
          "Hi {{firstName}},",
          "",
          `The referee abandoned ${fixtureLabel}.`,
          `Reason: ${reasonLabel}.`,
          input.details?.trim() ? `Referee note: ${input.details.trim()}` : null,
          "",
          "No automatic fee transfer has been applied because this abandonment was not recorded as being caused by one team's conduct. SIXFL will review any fee adjustment separately.",
          "",
          "The league/result outcome will also be decided by SIXFL after review.",
          "",
          "SIXFL",
        ].filter(Boolean).join("\n"),
        origin: "fixture-abandonment-notice",
        originLabel: "Abandoned match notice",
        metadata: {
          fixtureId: fixture.id,
          role: "team",
          reason: reason.value,
        },
        createdByUserId: input.recordedByUserId,
      });
      dispatchIds.push(dispatch.dispatchId);
    }
  }

  if (dispatchIds.length > 0) {
    await processNotificationQueue(Math.max(20, dispatchIds.length + 10));
  }

  return {
    fixtureId: fixture.id,
    reason: reason.value,
    responsibleTeamId: responsibleTeam?.id ?? null,
    innocentTeamId: innocentTeam?.id ?? null,
    responsibleFinalChargePence,
    innocentPaidPence,
    innocentCreditPence,
    innocentFeeOutcome,
    notificationsQueued: dispatchIds.length,
  };
}
