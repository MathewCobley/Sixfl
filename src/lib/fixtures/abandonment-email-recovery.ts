import { NotificationChannel, Prisma } from "@prisma/client";

import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";
import { getFixtureAbandonmentReasonLabel } from "@/lib/fixtures/abandonment";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { getDirectChargePaidTotal } from "@/lib/payments/charge-summary";
import { buildChargePaymentUrl } from "@/lib/payments/fixture-match-fees";
import { getPlayerFeeCashReceivedPence } from "@/lib/payments/player-fee-coverage";
import { prisma } from "@/lib/prisma";

type AbandonmentNoticeRow = {
  fixtureId: string;
  reason: string;
  responsibleTeamId: string | null;
  innocentTeamId: string | null;
  details: string | null;
  responsibleOriginalFeePence: number | null;
  innocentOriginalFeePence: number | null;
  responsibleFinalChargePence: number | null;
  innocentPaidPence: number;
  innocentCreditPence: number;
};

function formatMoney(pence: number) {
  return `£${(Math.max(0, pence) / 100).toFixed(2)}`;
}

function getPaidPence(input: {
  fixtureId: string;
  teamId: string;
  charge: {
    transactions: Array<{ amountPence: number; notes: string | null }>;
  } | null;
  fees: Array<{
    fixtureId: string;
    teamId: string;
    amountPence: number;
    status: string;
  }>;
}) {
  const directPaidPence = input.charge
    ? getDirectChargePaidTotal(input.charge.transactions)
    : 0;
  const playerPaidPence = input.fees
    .filter((fee) => fee.fixtureId === input.fixtureId && fee.teamId === input.teamId)
    .reduce(
      (sum, fee) =>
        sum +
        getPlayerFeeCashReceivedPence({
          amountPence: fee.amountPence,
          status: fee.status,
        }),
      0,
    );

  return directPaidPence + playerPaidPence;
}

export async function resendFixtureAbandonmentEmails(input: {
  fixtureId: string;
  createdByUserId: string;
}) {
  const rows = await prisma.$queryRaw<AbandonmentNoticeRow[]>(Prisma.sql`
    SELECT
      "fixtureId",
      "reason",
      "responsibleTeamId",
      "innocentTeamId",
      "details",
      "responsibleOriginalFeePence",
      "innocentOriginalFeePence",
      "responsibleFinalChargePence",
      "innocentPaidPence",
      "innocentCreditPence"
    FROM "FixtureAbandonment"
    WHERE "fixtureId" = ${input.fixtureId}
    LIMIT 1
  `);
  const abandonment = rows[0];
  if (!abandonment) {
    throw new Error("This fixture is not recorded as abandoned.");
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: input.fixtureId },
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      result: { select: { homeScore: true, awayScore: true } },
      paymentCharges: {
        select: {
          id: true,
          teamId: true,
          amountPence: true,
          paymentToken: true,
          transactions: {
            select: { amountPence: true, notes: true },
          },
        },
      },
    },
  });
  if (!fixture) throw new Error("Fixture not found.");

  const playerFees = await prisma.playerMatchFee.findMany({
    where: {
      fixtureId: fixture.id,
      teamId: { in: [fixture.homeTeam.id, fixture.awayTeam.id] },
    },
    select: {
      fixtureId: true,
      teamId: true,
      amountPence: true,
      status: true,
    },
  });

  const responsibleTeam = abandonment.responsibleTeamId
    ? abandonment.responsibleTeamId === fixture.homeTeam.id
      ? fixture.homeTeam
      : abandonment.responsibleTeamId === fixture.awayTeam.id
        ? fixture.awayTeam
        : null
    : null;
  const innocentTeam = abandonment.innocentTeamId
    ? abandonment.innocentTeamId === fixture.homeTeam.id
      ? fixture.homeTeam
      : abandonment.innocentTeamId === fixture.awayTeam.id
        ? fixture.awayTeam
        : null
    : null;

  const chargeByTeam = new Map(
    fixture.paymentCharges.map((charge) => [charge.teamId, charge]),
  );
  const fixtureLabel = `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`;
  const reasonLabel = getFixtureAbandonmentReasonLabel(abandonment.reason);
  const officialResultLine = fixture.result
    ? `SIXFL has awarded the official result: ${fixture.homeTeam.name} ${fixture.result.homeScore}-${fixture.result.awayScore} ${fixture.awayTeam.name}.`
    : "The league/result outcome remains for SIXFL to decide after reviewing the abandonment.";

  const queuedDispatchIds: string[] = [];
  const failures: string[] = [];

  const queueTeamEmail = async (args: Parameters<typeof sendTeamBroadcastMessage>[0]) => {
    try {
      const dispatch = await sendTeamBroadcastMessage(args);
      queuedDispatchIds.push(dispatch.dispatchId);
    } catch (error) {
      failures.push(
        `${args.teamId}: ${error instanceof Error ? error.message : "Unable to queue email"}`,
      );
    }
  };

  if (responsibleTeam && innocentTeam) {
    const responsibleCharge = chargeByTeam.get(responsibleTeam.id) ?? null;
    const responsiblePaidPence = getPaidPence({
      fixtureId: fixture.id,
      teamId: responsibleTeam.id,
      charge: responsibleCharge,
      fees: playerFees,
    });
    const total =
      abandonment.responsibleFinalChargePence ??
      responsibleCharge?.amountPence ??
      0;
    const outstanding = Math.max(0, total - responsiblePaidPence);
    const payUrl =
      outstanding > 0 && responsibleCharge?.paymentToken
        ? buildChargePaymentUrl(responsibleCharge.paymentToken)
        : null;

    await queueTeamEmail({
      teamId: responsibleTeam.id,
      channel: NotificationChannel.EMAIL,
      subject: `Match abandoned: fee decision for ${fixtureLabel}`,
      body: [
        "Hi {{firstName}},",
        "",
        `The referee abandoned ${fixtureLabel}.`,
        `Reason: ${reasonLabel}.`,
        abandonment.details ? `Referee note: ${abandonment.details}` : null,
        "",
        `Under the SIXFL abandoned-match rule, ${responsibleTeam.name} is responsible for both its own match fee (${formatMoney(abandonment.responsibleOriginalFeePence ?? 0)}) and ${innocentTeam.name}'s match fee (${formatMoney(abandonment.innocentOriginalFeePence ?? 0)}).`,
        `Total charge: ${formatMoney(total)}. Amount already covered: ${formatMoney(responsiblePaidPence)}. Outstanding: ${formatMoney(outstanding)}.`,
        "",
        officialResultLine,
        "",
        payUrl
          ? "Use the button below to pay the outstanding balance."
          : "No further payment is currently outstanding.",
        "",
        "SIXFL",
      ]
        .filter(Boolean)
        .join("\n"),
      ctaLabel: payUrl ? "Pay outstanding match fees" : null,
      ctaUrl: payUrl,
      origin: "fixture-abandonment-fee-decision-recovery",
      originLabel: "Abandoned match fee decision resend",
      metadata: {
        fixtureId: fixture.id,
        role: "responsible_team",
        recoveryResend: true,
      },
      createdByUserId: input.createdByUserId,
    });

    await queueTeamEmail({
      teamId: innocentTeam.id,
      channel: NotificationChannel.EMAIL,
      subject: `Match abandoned: your fee has been waived for ${fixtureLabel}`,
      body: [
        "Hi {{firstName}},",
        "",
        `The referee abandoned ${fixtureLabel}.`,
        `Reason: ${reasonLabel}.`,
        abandonment.details ? `Referee note: ${abandonment.details}` : null,
        "",
        `SIXFL has recorded ${responsibleTeam.name} as the team responsible for the abandonment. You will not be charged for this fixture.`,
        abandonment.innocentPaidPence > 0
          ? abandonment.innocentCreditPence > 0
            ? `${formatMoney(abandonment.innocentCreditPence)} that had already been paid has been added to ${innocentTeam.name}'s SIXFL team credit for a future match.`
            : `${formatMoney(abandonment.innocentPaidPence)} had already been paid. SIXFL will account for that payment separately.`
          : "No payment is due from your team for this abandoned fixture.",
        "",
        officialResultLine,
        "",
        "SIXFL",
      ]
        .filter(Boolean)
        .join("\n"),
      origin: "fixture-abandonment-fee-decision-recovery",
      originLabel: "Abandoned match fee decision resend",
      metadata: {
        fixtureId: fixture.id,
        role: "innocent_team",
        recoveryResend: true,
      },
      createdByUserId: input.createdByUserId,
    });
  } else {
    for (const team of [fixture.homeTeam, fixture.awayTeam]) {
      await queueTeamEmail({
        teamId: team.id,
        channel: NotificationChannel.EMAIL,
        subject: `Match abandoned: ${fixtureLabel}`,
        body: [
          "Hi {{firstName}},",
          "",
          `The referee abandoned ${fixtureLabel}.`,
          `Reason: ${reasonLabel}.`,
          abandonment.details ? `Referee note: ${abandonment.details}` : null,
          "",
          "No automatic fee transfer was applied because this abandonment was not recorded as being caused by one team's conduct. SIXFL will review any fee adjustment separately.",
          "",
          officialResultLine,
          "",
          "SIXFL",
        ]
          .filter(Boolean)
          .join("\n"),
        origin: "fixture-abandonment-notice-recovery",
        originLabel: "Abandoned match notice resend",
        metadata: {
          fixtureId: fixture.id,
          role: "team",
          recoveryResend: true,
        },
        createdByUserId: input.createdByUserId,
      });
    }
  }

  if (queuedDispatchIds.length > 0) {
    try {
      await processNotificationQueue(Math.max(20, queuedDispatchIds.length + 10));
    } catch (error) {
      console.error("Recovered abandonment emails were queued but immediate processing failed", error);
    }
  }

  if (queuedDispatchIds.length === 0) {
    throw new Error(
      failures.length > 0
        ? `No abandonment emails could be queued. ${failures.join(" | ")}`
        : "No abandonment emails could be queued.",
    );
  }

  return {
    queued: queuedDispatchIds.length,
    failed: failures.length,
    failures,
  };
}
