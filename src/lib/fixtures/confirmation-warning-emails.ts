import {
  NotificationAudience,
  NotificationChannel,
  Prisma,
  type NotificationDispatchStatus,
} from "@prisma/client";

import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { getPublicSiteUrl } from "@/lib/stripe/client";

export const FIXTURE_CONFIRMATION_WARNING_SOURCE_TYPE =
  "FIXTURE_CONFIRMATION_WARNING";
const BACKFILL_LIMIT = 100;

export type FixtureConfirmationWarningEmailInput = {
  warningId: string;
  fixtureId: string;
  teamId: string;
  teamName: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: Date;
  confirmationStatus: string | null;
  confirmedAt: Date | null;
  adminNote?: string | null;
  backfilled?: boolean;
  createdByUserId?: string | null;
};

type UpcomingWarningRow = FixtureConfirmationWarningEmailInput;

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

function getConfirmationDeadline(kickoffAt: Date) {
  return new Date(kickoffAt.getTime() - 72 * 60 * 60 * 1000);
}

function buildCaptainFixtureUrl(input: { teamId: string; fixtureId: string }) {
  const searchParams = new URLSearchParams({ fixtureId: input.fixtureId });
  return `${getPublicSiteUrl()}/captain/team/${encodeURIComponent(input.teamId)}/fixtures?${searchParams.toString()}`;
}

async function getUpcomingWarningsWithoutEmail(now: Date) {
  return prisma.$queryRaw<UpcomingWarningRow[]>(Prisma.sql`
    SELECT
      warning."id" AS "warningId",
      warning."fixtureId",
      warning."teamId",
      warning."note" AS "adminNote",
      team."name" AS "teamName",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName",
      fixture."kickoffAt",
      confirmation."status"::text AS "confirmationStatus",
      confirmation."confirmedAt"
    FROM "FixtureConfirmationLateFee" warning
    INNER JOIN "Fixture" fixture ON fixture."id" = warning."fixtureId"
    INNER JOIN "Team" team ON team."id" = warning."teamId"
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    LEFT JOIN "FixtureCaptainConfirmation" confirmation
      ON confirmation."fixtureId" = warning."fixtureId"
      AND confirmation."teamId" = warning."teamId"
    WHERE warning."status"::text = 'WARNING'
      AND warning."warningAt" IS NOT NULL
      AND fixture."status"::text = 'SCHEDULED'
      AND fixture."publishedAt" IS NOT NULL
      AND fixture."kickoffAt" > ${now}
      AND NOT EXISTS (
        SELECT 1
        FROM "NotificationDispatch" dispatch
        WHERE dispatch."sourceType" = ${FIXTURE_CONFIRMATION_WARNING_SOURCE_TYPE}
          AND dispatch."sourceId" = warning."id"
          AND dispatch."channel"::text = 'EMAIL'
          AND dispatch."status"::text IN ('QUEUED', 'PROCESSING', 'SENT')
      )
    ORDER BY fixture."kickoffAt" ASC
    LIMIT ${BACKFILL_LIMIT}
  `);
}

export async function queueFixtureConfirmationWarningEmail(
  warning: FixtureConfirmationWarningEmailInput,
) {
  const existingDispatch = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: FIXTURE_CONFIRMATION_WARNING_SOURCE_TYPE,
      sourceId: warning.warningId,
      channel: NotificationChannel.EMAIL,
      status: { in: ["QUEUED", "PROCESSING", "SENT"] },
    },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  if (existingDispatch) {
    return {
      status: "already_queued" as const,
      queued: 0,
      dispatchId: existingDispatch.id,
      dispatchStatus: existingDispatch.status,
    };
  }

  const { recipient, snapshot } = await upsertTeamNotificationRecipient(
    warning.teamId,
  );
  const deadline = getConfirmationDeadline(warning.kickoffAt);
  const fixtureUrl = buildCaptainFixtureUrl({
    teamId: warning.teamId,
    fixtureId: warning.fixtureId,
  });
  const contactName = snapshot.primaryContact.name ?? snapshot.teamName;
  const hasNowConfirmed = warning.confirmationStatus === "CONFIRMED";
  const adminNote = warning.adminNote?.trim() || null;

  const body = [
    `Hi ${contactName},`,
    "",
    "FORMAL WARNING – LATE FIXTURE CONFIRMATION",
    "",
    "This email is a formal warning from SIXFL.",
    "",
    `${warning.teamName} did not confirm the following fixture by the required 72-hour deadline:`,
    "",
    `Fixture: ${warning.homeTeamName} vs ${warning.awayTeamName}`,
    `Kick-off: ${formatDateTime(warning.kickoffAt)}`,
    `Confirmation deadline: ${formatDateTime(deadline)}`,
    "",
    hasNowConfirmed
      ? `The fixture was subsequently confirmed${warning.confirmedAt ? ` on ${formatDateTime(warning.confirmedAt)}` : ""}, but it was confirmed after the deadline.`
      : "The fixture is still awaiting confirmation. Please review and confirm it immediately.",
    "",
    "No £10 late-confirmation admin fee has been added on this occasion.",
    adminNote ? `SIXFL note: ${adminNote}` : null,
    "",
    "SIXFL does not want to charge admin fees. However, if future confirmation deadlines are missed and SIXFL has to chase or rearrange fixtures unnecessarily, a £10 late-confirmation admin fee may be applied.",
    "",
    "{{cta}}",
    "",
    "If there was a genuine issue that prevented confirmation, please contact SIXFL so it can be reviewed.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: `FORMAL WARNING: ${warning.teamName} missed a fixture confirmation deadline`,
    body,
    isTransactional: true,
    sourceType: FIXTURE_CONFIRMATION_WARNING_SOURCE_TYPE,
    sourceId: warning.warningId,
    emailCta: {
      label: hasNowConfirmed ? "View fixture" : "Confirm fixture now",
      url: fixtureUrl,
    },
    metadata: {
      warningId: warning.warningId,
      fixtureId: warning.fixtureId,
      teamId: warning.teamId,
      teamName: warning.teamName,
      kickoffAt: warning.kickoffAt.toISOString(),
      deadline: deadline.toISOString(),
      backfilled: warning.backfilled ?? false,
      origin: warning.backfilled
        ? "fixture_confirmation_warning_backfill"
        : "admin_late_fee_warning_button",
      originLabel: warning.backfilled
        ? "Fixture confirmation warning recovered by notification job"
        : "Formal fixture confirmation warning sent from Late Fees",
      actorRole: warning.createdByUserId ? "ADMIN" : "SYSTEM",
    },
    createdByUserId: warning.createdByUserId ?? null,
  });

  return {
    status:
      dispatch.status === "QUEUED"
        ? ("queued" as const)
        : ("not_queued" as const),
    queued: dispatch.status === "QUEUED" ? 1 : 0,
    dispatchId: dispatch.id,
    dispatchStatus: dispatch.status as NotificationDispatchStatus,
  };
}

export async function backfillUpcomingFixtureConfirmationWarningEmails() {
  const now = new Date();
  const warnings = await getUpcomingWarningsWithoutEmail(now);
  const summary = {
    scanned: warnings.length,
    queued: 0,
    alreadyQueued: 0,
    notQueued: 0,
    errors: [] as string[],
  };

  for (const warning of warnings) {
    try {
      const result = await queueFixtureConfirmationWarningEmail({
        ...warning,
        backfilled: true,
      });

      if (result.status === "queued") summary.queued += result.queued;
      else if (result.status === "already_queued") summary.alreadyQueued += 1;
      else summary.notQueued += 1;
    } catch (error) {
      if (summary.errors.length < 10) {
        summary.errors.push(
          `${warning.fixtureId}:${warning.teamId}: ${
            error instanceof Error
              ? error.message
              : "Unknown warning email error"
          }`,
        );
      }
    }
  }

  return summary;
}
