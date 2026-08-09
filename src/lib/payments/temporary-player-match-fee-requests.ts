import {
  NotificationAudience,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import {
  ensurePlayerMatchFeePaymentDetails,
  ensurePlayerMatchFeeReminderTemplates,
} from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";

type TemporaryPlayerFeeRow = {
  id: string;
  amountPence: number;
  paymentUrl: string | null;
  temporaryUserId: string;
  playerName: string | null;
  playerEmail: string | null;
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
  fixtureId: string;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
};

const REQUEST_TEMPLATE_KEY = "player-match-fee-request-email";
const REQUEST_SOURCE_TYPE = "PLAYER_MATCH_FEE_REQUEST";

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatKickoff(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] || "Player";
}

async function getTemporaryPlayerFee(feeId: string) {
  const rows = await prisma.$queryRaw<TemporaryPlayerFeeRow[]>`
    SELECT
      pmf."id",
      pmf."amountPence",
      pmf."paymentUrl",
      pmf."temporaryUserId",
      player."name" AS "playerName",
      player."email" AS "playerEmail",
      team."id" AS "teamId",
      team."name" AS "teamName",
      team."logoUrl" AS "teamLogoUrl",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason",
      fixture."id" AS "fixtureId",
      fixture."kickoffAt",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName"
    FROM "PlayerMatchFee" pmf
    INNER JOIN "User" player ON player."id" = pmf."temporaryUserId"
    INNER JOIN "Team" team ON team."id" = pmf."teamId"
    LEFT JOIN "League" league ON league."id" = team."leagueId"
    INNER JOIN "Fixture" fixture ON fixture."id" = pmf."fixtureId"
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    WHERE pmf."id" = ${feeId}
      AND pmf."temporaryUserId" IS NOT NULL
      AND pmf."status" = 'OPEN'::"PlayerMatchFeeStatus"
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function queueTemporaryPlayerMatchFeeRequest(feeId: string) {
  await ensurePlayerMatchFeeReminderTemplates();
  await ensurePlayerMatchFeePaymentDetails(feeId);

  const fee = await getTemporaryPlayerFee(feeId);
  if (!fee?.paymentUrl) {
    return { queued: 0, skipped: 1, status: "not_open" as const };
  }

  const email = fee.playerEmail?.trim() || null;
  if (!email) {
    return { queued: 0, skipped: 1, status: "no_contact" as const };
  }

  const existingDispatch = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: REQUEST_SOURCE_TYPE,
      sourceId: fee.id,
      channel: "EMAIL",
      status: {
        in: [
          NotificationDispatchStatus.QUEUED,
          NotificationDispatchStatus.PROCESSING,
          NotificationDispatchStatus.SENT,
        ],
      },
    },
    select: { id: true },
  });

  if (existingDispatch) {
    return { queued: 0, skipped: 0, status: "already_sent" as const };
  }

  const playerName = fee.playerName?.trim() || email;
  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `player-match-fee:${fee.id}`,
    audience: NotificationAudience.PLAYER,
    displayName: playerName,
    email,
    phone: null,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    metadata: {
      playerMatchFeeId: fee.id,
      teamId: fee.teamId,
      temporaryUserId: fee.temporaryUserId,
      entityType: "PLAYER_MATCH_FEE",
      temporaryPlayer: true,
    },
  });

  const leagueName = fee.leagueName
    ? `${fee.leagueName}${fee.leagueSeason ? ` · ${fee.leagueSeason}` : ""}`
    : "";
  const fixtureName = `${fee.homeTeamName} vs ${fee.awayTeamName}`;
  const fixtureLabel = `${fixtureName} · ${formatKickoff(fee.kickoffAt)}`;
  const variables = {
    firstName: getFirstName(playerName),
    fullName: playerName,
    teamName: fee.teamName,
    leagueName,
    fixtureLabel,
    fixtureName,
    kickoffDateTime: formatKickoff(fee.kickoffAt),
    amount: formatMoney(fee.amountPence),
    paymentUrl: fee.paymentUrl,
  };

  const dispatch = await queueNotificationFromTemplate({
    templateKey: REQUEST_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables,
    sourceType: REQUEST_SOURCE_TYPE,
    sourceId: fee.id,
    metadata: {
      origin: "temporary_player_match_fee",
      originLabel: "Temporary player match fee",
      mode: "request",
      playerMatchFeeId: fee.id,
      fixtureId: fee.fixtureId,
      teamId: fee.teamId,
      temporaryUserId: fee.temporaryUserId,
      paymentUrl: fee.paymentUrl,
    },
    emailBranding: {
      teamName: fee.teamName,
      teamLogoUrl: fee.teamLogoUrl,
      leagueName,
    },
    paymentSummary: {
      amount: formatMoney(fee.amountPence),
      reason: fixtureName,
    },
  });

  await logNotificationDispatchToThread({ dispatch, recipient });

  if (dispatch.status === NotificationDispatchStatus.QUEUED) {
    await prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: { lastChasedAt: new Date() },
    });
    return { queued: 1, skipped: 0, status: "queued" as const };
  }

  return { queued: 0, skipped: 1, status: "skipped" as const };
}

export async function queueOutstandingTemporaryPlayerMatchFeeRequests() {
  const fees = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT pmf."id"
    FROM "PlayerMatchFee" pmf
    WHERE pmf."status" = 'OPEN'::"PlayerMatchFeeStatus"
      AND pmf."temporaryUserId" IS NOT NULL
    ORDER BY pmf."createdAt" ASC
    LIMIT 100
  `;

  const summary = {
    scanned: fees.length,
    queued: 0,
    skipped: 0,
    alreadySent: 0,
  };

  for (const fee of fees) {
    try {
      const result = await queueTemporaryPlayerMatchFeeRequest(fee.id);
      summary.queued += result.queued;
      summary.skipped += result.skipped;
      if (result.status === "already_sent") summary.alreadySent += 1;
    } catch (error) {
      summary.skipped += 1;
      console.error("Temporary-player match fee request queue failed", {
        feeId: fee.id,
        error,
      });
    }
  }

  return summary;
}
