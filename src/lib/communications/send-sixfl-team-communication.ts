import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";

import { cupErrorMessage, previewCupInvitations, sendCupInvitations } from "@/lib/cups/invitations";
import { queueCupTestEmail } from "@/lib/cups/test-email";
import { extractNotificationTokens } from "@/lib/notifications/renderer";
import { prisma } from "@/lib/prisma";
import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";

const CUP_TEMPLATE_FIELDS = new Set([
  "cupFormat",
  "cupName",
  "matchFee",
  "responseDeadline",
  "scheduleNote",
  "venueNote",
]);

type SendMode = "SEND" | "TEST";

type Input = {
  teamId: string;
  channel: NotificationChannel;
  subject?: string | null;
  body: string;
  templateId?: string | null;
  templateKey?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  pollId?: string | null;
  origin: string;
  originLabel: string;
  metadata?: Record<string, unknown>;
  variables?: Record<string, string | number | boolean | null>;
  createdByUserId?: string | null;
  cupId?: string | null;
  sendMode?: SendMode;
  isTransactional?: boolean;
};

export type SIXFLTeamCommunicationResult = {
  workflow: "STANDARD" | "CUP_INVITATION" | "CUP_TEST";
  teamId: string;
  queuedCount: number;
  existingCount: number;
  skippedCount: number;
  skipped: boolean;
  reason: string | null;
  dispatchId: string | null;
  status: NotificationDispatchStatus | null;
};

function isCupTemplateContent(subject: string, body: string) {
  const fields = new Set([
    ...extractNotificationTokens(subject),
    ...extractNotificationTokens(body),
  ]);
  return Array.from(fields).some((field) => CUP_TEMPLATE_FIELDS.has(field));
}

async function resolveCupTemplate(input: Input) {
  if (input.channel !== NotificationChannel.EMAIL) return null;

  const template = input.templateId
    ? await prisma.emailTemplate.findUnique({
        where: { id: input.templateId },
        select: {
          id: true,
          key: true,
          subject: true,
          body: true,
          isActive: true,
          audience: true,
        },
      })
    : null;

  const subject = template?.subject ?? input.subject ?? "";
  const body = template?.body ?? input.body;

  if (!isCupTemplateContent(subject, body)) return null;

  if (!template?.isActive || template.audience !== "TEAM") {
    throw new Error("Choose an active Team Cup email template.");
  }

  return template;
}

async function resolveCupId(explicitCupId?: string | null) {
  if (explicitCupId?.trim()) return explicitCupId.trim();

  const openCups = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT l.id
     FROM "League" l
     JOIN "LeagueCompetition" c ON c.id = l."competitionId"
     JOIN "CupInvitationSettings" s ON s."cupLeagueId" = l.id
     WHERE c."competitionType" = 'CUP'
       AND l."isActive" = true
       AND c."isActive" = true
       AND s.state = 'OPEN'
       AND s."responseDeadline" > NOW()
     ORDER BY l."createdAt" DESC
     LIMIT 2`,
  );

  if (openCups.length === 0) {
    throw new Error(
      "Cup invitations are currently Draft / closed. Change the Cup to Open before sending.",
    );
  }

  if (openCups.length > 1) {
    throw new Error(
      "More than one Cup is open. Choose the Cup explicitly before sending this Cup email.",
    );
  }

  return openCups[0].id;
}

/**
 * Canonical team communication entry point.
 *
 * Screens choose recipients and content; this service decides which workflow the
 * email requires. A Cup template therefore behaves as a Cup invitation whether
 * it is launched from Team Messages, League Broadcast, or another team-email UI.
 */
export async function sendSIXFLTeamCommunication(
  input: Input,
): Promise<SIXFLTeamCommunicationResult> {
  const cupTemplate = await resolveCupTemplate(input);

  if (!cupTemplate) {
    const result = await sendTeamBroadcastMessage(input);
    return {
      workflow: "STANDARD",
      teamId: result.teamId,
      queuedCount: result.skipped ? 0 : 1,
      existingCount: 0,
      skippedCount: result.skipped ? 1 : 0,
      skipped: result.skipped,
      reason: result.reason,
      dispatchId: result.dispatchId,
      status: result.status,
    };
  }

  if (!input.createdByUserId?.trim()) {
    throw new Error("Administrator identity is required for a Cup invitation.");
  }

  const cupId = await resolveCupId(input.cupId);

  if (input.sendMode === "TEST") {
    await queueCupTestEmail({
      cupId,
      actorId: input.createdByUserId,
      teamId: input.teamId,
      templateId: cupTemplate.id,
    });

    return {
      workflow: "CUP_TEST",
      teamId: input.teamId,
      queuedCount: 1,
      existingCount: 0,
      skippedCount: 0,
      skipped: false,
      reason: null,
      dispatchId: null,
      status: NotificationDispatchStatus.QUEUED,
    };
  }

  const kind = (cupTemplate.key || input.templateKey || "")
    .toLowerCase()
    .includes("reminder")
    ? "REMINDER"
    : "INITIAL";

  try {
    const preview = await previewCupInvitations({
      cupId,
      actorId: input.createdByUserId,
      teamIds: [input.teamId],
      kind,
      templateId: cupTemplate.id,
    });

    const results = await sendCupInvitations({
      cupId,
      actorId: input.createdByUserId,
      teamIds: [input.teamId],
      kind,
      templateId: cupTemplate.id,
      previewKey: preview.previewKey,
      confirmed: true,
    });

    const queuedCount = results.reduce((sum, result) => sum + result.queued, 0);
    const existingCount = results.reduce((sum, result) => sum + result.existing, 0);
    const skippedCount = results.reduce((sum, result) => sum + result.skipped, 0);
    const error = results.find((result) => result.error)?.error ?? null;

    if (error) throw new Error(error);

    return {
      workflow: "CUP_INVITATION",
      teamId: input.teamId,
      queuedCount,
      existingCount,
      skippedCount,
      skipped: queuedCount === 0 && existingCount === 0,
      reason:
        queuedCount === 0 && existingCount === 0 && skippedCount > 0
          ? "Cup invitation was blocked or skipped."
          : null,
      dispatchId: null,
      status: queuedCount > 0 ? NotificationDispatchStatus.QUEUED : null,
    };
  } catch (error) {
    throw new Error(cupErrorMessage(error));
  }
}
