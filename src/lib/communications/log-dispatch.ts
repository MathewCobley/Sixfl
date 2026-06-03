// ========================================
// File: src/lib/communications/log-dispatch.ts
// ========================================

import {
  MessageChannel,
  MessageDirection,
  MessageParticipantRole,
  NotificationChannel,
  type NotificationDispatch,
  type NotificationRecipient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

type RecipientSnapshot = Pick<
  NotificationRecipient,
  | "id"
  | "displayName"
  | "email"
  | "phone"
  | "emailNormalized"
  | "phoneNormalized"
>;

const PLAYER_MATCH_FEE_SOURCE_TYPES = new Set([
  "PLAYER_MATCH_FEE_REQUEST",
  "PLAYER_MATCH_FEE_CHASE_24H",
  "PLAYER_MATCH_FEE_CHASE_72H",
]);

const FIXTURE_MATCH_FEE_SOURCE_TYPES = new Set([
  "FIXTURE_MATCH_FEE",
  "FIXTURE_MATCH_FEE_REMINDER",
]);

function getMessageChannel(channel: NotificationChannel): MessageChannel {
  return channel === "SMS" ? "SMS" : "EMAIL";
}

function getParticipantRole(createdByUserId: string | null): MessageParticipantRole {
  return createdByUserId ? "ADMIN" : "SYSTEM";
}

function getProviderStatusLabel(dispatch: NotificationDispatch) {
  const reason = dispatch.failureReason?.trim();

  if (!reason) {
    return dispatch.status;
  }

  return `${dispatch.status}: ${reason}`;
}

function buildPreview(bodyText: string) {
  const trimmed = bodyText.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function getMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function getMetadataString(metadata: unknown, key: string) {
  const record = getMetadataRecord(metadata);
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPlayerMatchFeeDispatch(dispatch: NotificationDispatch) {
  return Boolean(
    dispatch.sourceType && PLAYER_MATCH_FEE_SOURCE_TYPES.has(dispatch.sourceType),
  );
}

function isFixtureMatchFeeDispatch(dispatch: NotificationDispatch) {
  return Boolean(
    dispatch.sourceType && FIXTURE_MATCH_FEE_SOURCE_TYPES.has(dispatch.sourceType),
  );
}

async function resolveThreadContext(dispatch: NotificationDispatch) {
  if (dispatch.sourceType === "TEAM" && dispatch.sourceId) {
    const team = await prisma.team.findUnique({
      where: { id: dispatch.sourceId },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        contactPhone: true,
        leagueId: true,
      },
    });

    if (team) {
      return {
        sourceType: "TEAM",
        sourceId: team.id,
        teamId: team.id,
        leagueId: team.leagueId,
        contactName: team.name,
        contactEmail: team.contactEmail,
        contactPhone: team.contactPhone,
      };
    }
  }

  if (isFixtureMatchFeeDispatch(dispatch)) {
    const chargeId =
      getMetadataString(dispatch.metadata, "chargeId") ??
      dispatch.sourceId?.trim() ??
      null;

    if (chargeId) {
      const charge = await prisma.paymentCharge.findUnique({
        where: { id: chargeId },
        select: {
          id: true,
          teamId: true,
          leagueId: true,
          team: {
            select: {
              id: true,
              name: true,
              contactEmail: true,
              contactPhone: true,
            },
          },
        },
      });

      if (charge?.team) {
        return {
          sourceType: "TEAM",
          sourceId: charge.team.id,
          teamId: charge.teamId,
          leagueId: charge.leagueId,
          contactName: charge.team.name,
          contactEmail: charge.team.contactEmail,
          contactPhone: charge.team.contactPhone,
        };
      }
    }
  }

  if (dispatch.sourceType === "TEAM_PLAYER_PROSPECT" && dispatch.sourceId) {
    const prospect = await prisma.teamPlayerProspect.findUnique({
      where: { id: dispatch.sourceId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        teamId: true,
        team: {
          select: {
            leagueId: true,
          },
        },
      },
    });

    if (prospect) {
      const displayName = [prospect.firstName, prospect.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      return {
        sourceType: "TEAM_PLAYER_PROSPECT",
        sourceId: prospect.id,
        teamId: prospect.teamId,
        leagueId: prospect.team?.leagueId ?? null,
        contactName: displayName || prospect.firstName,
        contactEmail: prospect.email,
        contactPhone: prospect.phone,
      };
    }
  }

  if (isPlayerMatchFeeDispatch(dispatch)) {
    const playerMatchFeeId =
      getMetadataString(dispatch.metadata, "playerMatchFeeId") ??
      dispatch.sourceId?.trim() ??
      null;

    if (playerMatchFeeId) {
      const fee = await prisma.playerMatchFee.findUnique({
        where: { id: playerMatchFeeId },
        select: {
          id: true,
          teamId: true,
          team: {
            select: {
              leagueId: true,
            },
          },
          prospect: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          teamMember: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (fee?.prospect) {
        const displayName = [fee.prospect.firstName, fee.prospect.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();

        return {
          sourceType: "TEAM_PLAYER_PROSPECT",
          sourceId: fee.prospect.id,
          teamId: fee.teamId,
          leagueId: fee.team?.leagueId ?? null,
          contactName: displayName || fee.prospect.firstName,
          contactEmail: fee.prospect.email,
          contactPhone: fee.prospect.phone,
        };
      }

      if (fee?.teamMember) {
        return {
          sourceType: "TEAM_MEMBER",
          sourceId: fee.teamMember.id,
          teamId: fee.teamId,
          leagueId: fee.team?.leagueId ?? null,
          contactName: fee.teamMember.user.name ?? fee.teamMember.user.email ?? null,
          contactEmail: fee.teamMember.user.email,
          contactPhone: null,
        };
      }
    }
  }

  if (dispatch.sourceType === "LEAD" && dispatch.sourceId) {
    const lead = await prisma.interestLead.findUnique({
      where: { id: dispatch.sourceId },
      select: {
        id: true,
        contactName: true,
        email: true,
        phone: true,
      },
    });

    if (lead) {
      return {
        sourceType: "LEAD",
        sourceId: lead.id,
        teamId: null,
        leagueId: null,
        contactName: lead.contactName || null,
        contactEmail: lead.email || null,
        contactPhone: lead.phone || null,
      };
    }
  }

  return {
    sourceType: dispatch.sourceType?.trim() || null,
    sourceId: dispatch.sourceId?.trim() || null,
    teamId: null,
    leagueId: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
  };
}

function buildThreadLookupFilters(input: {
  channel: MessageChannel;
  context: Awaited<ReturnType<typeof resolveThreadContext>>;
  dispatch: NotificationDispatch;
}) {
  const filters: Array<{
    channel: MessageChannel;
    sourceType: string | null;
    sourceId: string | null;
  }> = [
    {
      channel: input.channel,
      sourceType: input.context.sourceType,
      sourceId: input.context.sourceId,
    },
  ];

  // Earlier player match fee automations could create a thread against the fee
  // dispatch itself. Also look for that legacy thread so the next log/update
  // moves it onto the actual player/prospect history instead of leaving it only
  // visible in the central comms inbox.
  if (isPlayerMatchFeeDispatch(input.dispatch) && input.dispatch.sourceType && input.dispatch.sourceId) {
    filters.push({
      channel: input.channel,
      sourceType: input.dispatch.sourceType,
      sourceId: input.dispatch.sourceId,
    });
  }

  if (isFixtureMatchFeeDispatch(input.dispatch) && input.dispatch.sourceType && input.dispatch.sourceId) {
    filters.push({
      channel: input.channel,
      sourceType: input.dispatch.sourceType,
      sourceId: input.dispatch.sourceId,
    });
  }

  return filters;
}

export async function logNotificationDispatchToThread(input: {
  dispatch: NotificationDispatch;
  recipient: RecipientSnapshot;
}) {
  const { dispatch, recipient } = input;
  const channel = getMessageChannel(dispatch.channel);
  const context = await resolveThreadContext(dispatch);
  const preview = buildPreview(dispatch.bodyText);
  const providerStatus = getProviderStatusLabel(dispatch);

  const existingThread = await prisma.messageThread.findFirst({
    where: {
      OR: buildThreadLookupFilters({ channel, context, dispatch }),
    },
    select: {
      id: true,
    },
  });

  const thread = existingThread
    ? await prisma.messageThread.update({
        where: { id: existingThread.id },
        data: {
          recipientId: recipient.id,
          teamId: context.teamId,
          leagueId: context.leagueId,
          sourceType: context.sourceType,
          sourceId: context.sourceId,
          contactName: context.contactName ?? recipient.displayName ?? null,
          contactEmail: context.contactEmail ?? recipient.email ?? null,
          emailNormalized: recipient.emailNormalized ?? null,
          contactPhone: context.contactPhone ?? recipient.phone ?? null,
          phoneNormalized: recipient.phoneNormalized ?? null,
          lastMessagePreview: preview,
          latestMessageAt: new Date(),
          latestOutboundAt: new Date(),
          status: "OPEN",
        },
      })
    : await prisma.messageThread.create({
        data: {
          channel,
          status: "OPEN",
          recipientId: recipient.id,
          teamId: context.teamId,
          leagueId: context.leagueId,
          sourceType: context.sourceType,
          sourceId: context.sourceId,
          contactName: context.contactName ?? recipient.displayName ?? null,
          contactEmail: context.contactEmail ?? recipient.email ?? null,
          emailNormalized: recipient.emailNormalized ?? null,
          contactPhone: context.contactPhone ?? recipient.phone ?? null,
          phoneNormalized: recipient.phoneNormalized ?? null,
          lastMessagePreview: preview,
          latestMessageAt: new Date(),
          latestOutboundAt: new Date(),
        },
      });

  const existingEntry = await prisma.messageEntry.findFirst({
    where: {
      notificationDispatchId: dispatch.id,
    },
    select: {
      id: true,
    },
  });

  const entry = existingEntry
    ? await prisma.messageEntry.update({
        where: { id: existingEntry.id },
        data: {
          threadId: thread.id,
          channel,
          direction: MessageDirection.OUTBOUND,
          participantRole: getParticipantRole(dispatch.createdByUserId ?? null),
          body: dispatch.bodyText,
          subject: dispatch.subject,
          textBody: dispatch.bodyText,
          htmlBody: dispatch.bodyHtml,
          toNumber: dispatch.channel === "SMS" ? recipient.phone ?? null : null,
          toEmail: dispatch.channel === "EMAIL" ? recipient.email ?? null : null,
          provider: dispatch.provider,
          providerMessageId: dispatch.providerMessageId,
          providerStatus,
          notificationDispatchId: dispatch.id,
          createdByUserId: dispatch.createdByUserId ?? null,
          sentAt: dispatch.sentAt,
        },
        select: {
          id: true,
          sentAt: true,
        },
      })
    : await prisma.messageEntry.create({
        data: {
          threadId: thread.id,
          channel,
          direction: MessageDirection.OUTBOUND,
          participantRole: getParticipantRole(dispatch.createdByUserId ?? null),
          body: dispatch.bodyText,
          subject: dispatch.subject,
          textBody: dispatch.bodyText,
          htmlBody: dispatch.bodyHtml,
          toNumber: dispatch.channel === "SMS" ? recipient.phone ?? null : null,
          toEmail: dispatch.channel === "EMAIL" ? recipient.email ?? null : null,
          provider: dispatch.provider,
          providerMessageId: dispatch.providerMessageId,
          providerStatus,
          notificationDispatchId: dispatch.id,
          createdByUserId: dispatch.createdByUserId ?? null,
          sentAt: dispatch.sentAt,
        },
        select: {
          id: true,
          sentAt: true,
        },
      });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: {
      lastOutboundMessageId: entry.id,
      latestMessageAt: entry.sentAt ?? new Date(),
      latestOutboundAt: entry.sentAt ?? new Date(),
    },
  });

  return thread;
}
