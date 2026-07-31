// ========================================
// File: src/lib/notifications/delivery-issue-repair.ts
// ========================================

import {
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { normalizeEmailAddress } from "@/lib/notifications/email-health";
import { prisma } from "@/lib/prisma";

type SourceReference = {
  sourceType: NotificationRecipientSourceType;
  sourceId: string;
};

type SourceResult = {
  updated: boolean;
  label: string;
  references: SourceReference[];
};

type RepairRecipient = {
  id: string;
  sourceType: NotificationRecipientSourceType;
  sourceId: string | null;
  displayName: string | null;
  email: string | null;
  emailNormalized: string | null;
  isSuppressed: boolean;
  metadata: Prisma.JsonValue | null;
};

export class DeliveryIssueRepairError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function jsonRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, Prisma.JsonValue>;
  }
  return value as Record<string, Prisma.JsonValue>;
}

function metadataString(
  value: Prisma.JsonValue | null | undefined,
  key: string,
) {
  const candidate = jsonRecord(value)[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function optionalJson(value: Prisma.JsonValue | null) {
  return value === null ? undefined : inputJson(value);
}

function uniqueReferences(references: SourceReference[]) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.sourceType}:${reference.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function ensureUserEmailAvailable(
  tx: Prisma.TransactionClient,
  userId: string,
  email: string,
) {
  const owner = await tx.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (owner && owner.id !== userId) {
    throw new DeliveryIssueRepairError("email_in_use");
  }
}

async function updateLead(
  tx: Prisma.TransactionClient,
  leadId: string,
  email: string,
): Promise<SourceResult> {
  const result = await tx.interestLead.updateMany({
    where: { id: leadId },
    data: { email },
  });
  if (!result.count) throw new DeliveryIssueRepairError("source_not_found");
  return {
    updated: true,
    label: "lead",
    references: [
      { sourceType: NotificationRecipientSourceType.LEAD, sourceId: leadId },
    ],
  };
}

async function updateUser(
  tx: Prisma.TransactionClient,
  userId: string,
  oldEmail: string,
  newEmail: string,
): Promise<SourceResult> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, createdFromLeadId: true },
  });
  if (!user) throw new DeliveryIssueRepairError("source_not_found");

  await ensureUserEmailAvailable(tx, user.id, newEmail);
  await tx.user.update({ where: { id: user.id }, data: { email: newEmail } });

  const references: SourceReference[] = [
    { sourceType: NotificationRecipientSourceType.USER, sourceId: user.id },
  ];
  if (user.role === "REFEREE") {
    references.push({
      sourceType: NotificationRecipientSourceType.REFEREE,
      sourceId: user.id,
    });
  }

  if (user.createdFromLeadId) {
    const lead = await tx.interestLead.findUnique({
      where: { id: user.createdFromLeadId },
      select: { id: true, email: true },
    });
    if (lead && (!lead.email || normalizeEmailAddress(lead.email) === oldEmail)) {
      await tx.interestLead.update({
        where: { id: lead.id },
        data: { email: newEmail },
      });
      references.push({
        sourceType: NotificationRecipientSourceType.LEAD,
        sourceId: lead.id,
      });
    }
  }

  return {
    updated: true,
    label: user.role === "REFEREE" ? "referee account" : "user account",
    references,
  };
}

async function updateMember(
  tx: Prisma.TransactionClient,
  membershipId: string,
  oldEmail: string,
  newEmail: string,
): Promise<SourceResult> {
  const member = await tx.teamMember.findUnique({
    where: { id: membershipId },
    select: { id: true, userId: true },
  });
  if (!member) throw new DeliveryIssueRepairError("source_not_found");

  const result = await updateUser(tx, member.userId, oldEmail, newEmail);
  return {
    ...result,
    label: "player account",
    references: [
      ...result.references,
      {
        sourceType: NotificationRecipientSourceType.PLAYER,
        sourceId: member.id,
      },
    ],
  };
}

async function updateProspect(
  tx: Prisma.TransactionClient,
  prospectId: string,
  email: string,
): Promise<SourceResult> {
  const result = await tx.teamPlayerProspect.updateMany({
    where: { id: prospectId },
    data: { email },
  });
  if (!result.count) throw new DeliveryIssueRepairError("source_not_found");

  return {
    updated: true,
    label: "player prospect",
    references: [
      {
        sourceType: NotificationRecipientSourceType.PLAYER,
        sourceId: prospectId,
      },
      {
        sourceType: NotificationRecipientSourceType.GENERAL,
        sourceId: `team-prospect:${prospectId}`,
      },
    ],
  };
}

async function updateTeam(
  tx: Prisma.TransactionClient,
  teamId: string,
  oldEmail: string,
  newEmail: string,
): Promise<SourceResult> {
  const team = await tx.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      contactEmail: true,
      secondaryContactEmail: true,
      createdByUser: { select: { id: true, email: true } },
      convertedFromLead: { select: { id: true, email: true } },
      members: {
        select: {
          id: true,
          user: { select: { email: true } },
        },
      },
    },
  });
  if (!team) throw new DeliveryIssueRepairError("source_not_found");

  const primary = normalizeEmailAddress(team.contactEmail) === oldEmail;
  const secondary =
    normalizeEmailAddress(team.secondaryContactEmail) === oldEmail;
  const member = team.members.find(
    (item) => normalizeEmailAddress(item.user.email) === oldEmail,
  );
  const creator =
    team.createdByUser &&
    normalizeEmailAddress(team.createdByUser.email) === oldEmail;
  const lead =
    team.convertedFromLead &&
    normalizeEmailAddress(team.convertedFromLead.email) === oldEmail;
  const teamReference: SourceReference = {
    sourceType: NotificationRecipientSourceType.TEAM,
    sourceId: team.id,
  };

  if (primary || secondary) {
    await tx.team.update({
      where: { id: team.id },
      data:
        secondary && !primary
          ? { secondaryContactEmail: newEmail }
          : { contactEmail: newEmail },
    });
    const references = [teamReference];
    if (lead && team.convertedFromLead) {
      await tx.interestLead.update({
        where: { id: team.convertedFromLead.id },
        data: { email: newEmail },
      });
      references.push({
        sourceType: NotificationRecipientSourceType.LEAD,
        sourceId: team.convertedFromLead.id,
      });
    }
    return {
      updated: true,
      label: secondary && !primary ? "team secondary contact" : "team primary contact",
      references,
    };
  }

  if (member) {
    const result = await updateMember(tx, member.id, oldEmail, newEmail);
    return {
      ...result,
      label: "team member account",
      references: [teamReference, ...result.references],
    };
  }

  if (creator && team.createdByUser) {
    const result = await updateUser(
      tx,
      team.createdByUser.id,
      oldEmail,
      newEmail,
    );
    return {
      ...result,
      label: "team creator account",
      references: [teamReference, ...result.references],
    };
  }

  if (lead && team.convertedFromLead) {
    const result = await updateLead(tx, team.convertedFromLead.id, newEmail);
    return {
      ...result,
      label: "team lead contact",
      references: [teamReference, ...result.references],
    };
  }

  await tx.team.update({
    where: { id: team.id },
    data: { contactEmail: newEmail },
  });
  return { updated: true, label: "team primary contact", references: [teamReference] };
}

async function updatePlayerMatchFee(
  tx: Prisma.TransactionClient,
  feeId: string,
  oldEmail: string,
  newEmail: string,
) {
  const fee = await tx.playerMatchFee.findUnique({
    where: { id: feeId },
    select: { teamMemberId: true, prospectId: true },
  });
  if (!fee) throw new DeliveryIssueRepairError("source_not_found");
  if (fee.teamMemberId) {
    return updateMember(tx, fee.teamMemberId, oldEmail, newEmail);
  }
  if (fee.prospectId) return updateProspect(tx, fee.prospectId, newEmail);
  return { updated: false, label: "notification recipient", references: [] };
}

async function updateSource(
  tx: Prisma.TransactionClient,
  recipient: RepairRecipient,
  oldEmail: string,
  newEmail: string,
): Promise<SourceResult> {
  const sourceId = recipient.sourceId?.trim() || null;

  if (recipient.sourceType === NotificationRecipientSourceType.TEAM && sourceId) {
    return updateTeam(tx, sourceId, oldEmail, newEmail);
  }
  if (recipient.sourceType === NotificationRecipientSourceType.LEAD && sourceId) {
    return updateLead(tx, sourceId, newEmail);
  }
  if (
    (recipient.sourceType === NotificationRecipientSourceType.USER ||
      recipient.sourceType === NotificationRecipientSourceType.REFEREE) &&
    sourceId
  ) {
    return updateUser(tx, sourceId, oldEmail, newEmail);
  }
  if (recipient.sourceType === NotificationRecipientSourceType.PLAYER && sourceId) {
    const member = await tx.teamMember.findUnique({
      where: { id: sourceId },
      select: { id: true },
    });
    if (member) return updateMember(tx, sourceId, oldEmail, newEmail);
    return updateProspect(tx, sourceId, newEmail);
  }

  if (recipient.sourceType === NotificationRecipientSourceType.GENERAL) {
    const memberId = metadataString(recipient.metadata, "teamMemberId");
    const prospectId = metadataString(recipient.metadata, "prospectId");
    const feeId =
      metadataString(recipient.metadata, "playerMatchFeeId") ??
      (sourceId?.startsWith("player-match-fee:")
        ? sourceId.slice("player-match-fee:".length)
        : null);
    const userId =
      metadataString(recipient.metadata, "refereeUserId") ??
      metadataString(recipient.metadata, "userId");
    const leadId =
      metadataString(recipient.metadata, "interestLeadId") ??
      metadataString(recipient.metadata, "leadId");
    const teamId = metadataString(recipient.metadata, "teamId");

    if (memberId) return updateMember(tx, memberId, oldEmail, newEmail);
    if (prospectId) return updateProspect(tx, prospectId, newEmail);
    if (feeId) return updatePlayerMatchFee(tx, feeId, oldEmail, newEmail);
    if (sourceId?.startsWith("team-prospect:")) {
      return updateProspect(tx, sourceId.slice("team-prospect:".length), newEmail);
    }
    if (userId) return updateUser(tx, userId, oldEmail, newEmail);
    if (leadId) return updateLead(tx, leadId, newEmail);
    if (metadataString(recipient.metadata, "entityType") === "TEAM" && teamId) {
      return updateTeam(tx, teamId, oldEmail, newEmail);
    }
  }

  return { updated: false, label: "notification recipient", references: [] };
}

function resolutionMetadata(input: {
  existing: Prisma.JsonValue | null;
  recipientId: string;
  oldEmail: string;
  newEmail: string;
  resolvedAt: string;
  resolvedByUserId: string | null;
  sourceLabel: string;
  sourceUpdated: boolean;
  resendConfirmed: boolean;
  retryDispatchId: string | null;
  retryOfDispatchId: string | null;
}) {
  const existing = jsonRecord(input.existing);
  const history = Array.isArray(existing.deliveryIssueHistory)
    ? existing.deliveryIssueHistory.slice(-19)
    : [];
  const resolution = {
    type: "ADMIN_EMAIL_CORRECTION",
    recipientId: input.recipientId,
    oldEmail: input.oldEmail || null,
    newEmail: input.newEmail,
    resolvedAt: input.resolvedAt,
    resolvedByUserId: input.resolvedByUserId,
    sourceLabel: input.sourceLabel,
    sourceRecordUpdated: input.sourceUpdated,
    resendSuppressionConfirmed: input.resendConfirmed,
    retryDispatchId: input.retryDispatchId,
    retryOfDispatchId: input.retryOfDispatchId,
  };

  return inputJson({
    ...existing,
    deliveryIssueResolvedAt: input.resolvedAt,
    deliveryIssueResolvedByUserId: input.resolvedByUserId,
    deliveryIssueOldEmail: input.oldEmail || null,
    deliveryIssueNewEmail: input.newEmail,
    deliveryIssueResolution: resolution,
    deliveryIssueHistory: [...history, resolution],
  });
}

async function updateLinkedRecipients(input: {
  tx: Prisma.TransactionClient;
  mainRecipientId: string;
  references: SourceReference[];
  oldEmail: string;
  newEmail: string;
  resolvedAt: string;
  resolvedByUserId: string | null;
  resendConfirmed: boolean;
}) {
  const references = uniqueReferences(input.references);
  if (!references.length) return;

  const recipients = await input.tx.notificationRecipient.findMany({
    where: {
      id: { not: input.mainRecipientId },
      OR: references.map((reference) => ({
        sourceType: reference.sourceType,
        sourceId: reference.sourceId,
      })),
    },
    select: { id: true, metadata: true },
  });

  for (const recipient of recipients) {
    await input.tx.notificationRecipient.update({
      where: { id: recipient.id },
      data: {
        email: input.newEmail,
        emailNormalized: input.newEmail,
        isSuppressed: false,
        suppressionReason: null,
        lastSyncedAt: new Date(input.resolvedAt),
        metadata: resolutionMetadata({
          existing: recipient.metadata,
          recipientId: recipient.id,
          oldEmail: input.oldEmail,
          newEmail: input.newEmail,
          resolvedAt: input.resolvedAt,
          resolvedByUserId: input.resolvedByUserId,
          sourceLabel: "linked source record",
          sourceUpdated: true,
          resendConfirmed: input.resendConfirmed,
          retryDispatchId: null,
          retryOfDispatchId: null,
        }),
      },
    });
    await input.tx.messageThread.updateMany({
      where: { recipientId: recipient.id },
      data: { contactEmail: input.newEmail, emailNormalized: input.newEmail },
    });
  }
}

export type RepairDeliveryIssueInput = {
  recipientId: string;
  newEmail: string;
  retryDispatchId?: string | null;
  retryLatest: boolean;
  confirmedResendRemoval: boolean;
  resolvedByUserId?: string | null;
};

export type RepairDeliveryIssueResult = {
  recipientName: string;
  sourceUpdated: boolean;
  retryDispatchId: string | null;
};

export async function repairDeliveryIssue(
  input: RepairDeliveryIssueInput,
): Promise<RepairDeliveryIssueResult> {
  return prisma.$transaction(async (tx) => {
    const recipient = await tx.notificationRecipient.findUnique({
      where: { id: input.recipientId },
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        displayName: true,
        email: true,
        emailNormalized: true,
        isSuppressed: true,
        metadata: true,
      },
    });
    if (!recipient) throw new DeliveryIssueRepairError("recipient_not_found");

    const oldEmail = normalizeEmailAddress(
      recipient.emailNormalized ?? recipient.email,
    );
    if (
      recipient.isSuppressed &&
      oldEmail === input.newEmail &&
      !input.confirmedResendRemoval
    ) {
      throw new DeliveryIssueRepairError("resend_confirmation_required");
    }

    const source = await updateSource(tx, recipient, oldEmail, input.newEmail);
    const now = new Date();
    const resolvedAt = now.toISOString();
    const adminUserId = input.resolvedByUserId ?? null;
    let replacementId: string | null = null;
    let originalId: string | null = null;

    if (input.retryLatest) {
      if (!input.retryDispatchId) {
        throw new DeliveryIssueRepairError("retry_not_available");
      }
      const failed = await tx.notificationDispatch.findFirst({
        where: {
          id: input.retryDispatchId,
          recipientId: recipient.id,
          channel: NotificationChannel.EMAIL,
          status: NotificationDispatchStatus.FAILED,
        },
        select: {
          id: true,
          recipientId: true,
          templateId: true,
          audience: true,
          isTransactional: true,
          subject: true,
          bodyText: true,
          bodyHtml: true,
          sourceType: true,
          sourceId: true,
          variables: true,
          metadata: true,
        },
      });
      if (!failed) throw new DeliveryIssueRepairError("retry_not_available");
      if (metadataString(failed.metadata, "deliveryIssueRetryDispatchId")) {
        throw new DeliveryIssueRepairError("retry_already_queued");
      }

      const replacement = await tx.notificationDispatch.create({
        data: {
          recipientId: failed.recipientId,
          templateId: failed.templateId,
          channel: NotificationChannel.EMAIL,
          audience: failed.audience,
          status: NotificationDispatchStatus.QUEUED,
          isTransactional: failed.isTransactional,
          subject: failed.subject,
          bodyText: failed.bodyText,
          bodyHtml: failed.bodyHtml,
          sourceType: failed.sourceType,
          sourceId: failed.sourceId,
          variables: optionalJson(failed.variables),
          metadata: inputJson({
            ...jsonRecord(failed.metadata),
            retryOfDispatchId: failed.id,
            retryReason: "DELIVERY_ISSUE_EMAIL_CORRECTED",
            deliveryIssueRetryQueuedAt: resolvedAt,
            deliveryIssueRetryQueuedByUserId: adminUserId,
            deliveryIssueOldEmail: oldEmail || null,
            deliveryIssueNewEmail: input.newEmail,
          }),
          scheduledFor: now,
          createdByUserId: adminUserId,
        },
        select: { id: true },
      });
      replacementId = replacement.id;
      originalId = failed.id;
      await tx.notificationDispatch.update({
        where: { id: failed.id },
        data: {
          metadata: inputJson({
            ...jsonRecord(failed.metadata),
            deliveryIssueRetriedAt: resolvedAt,
            deliveryIssueRetryDispatchId: replacement.id,
            deliveryIssueRetryQueuedByUserId: adminUserId,
          }),
        },
      });
    }

    await tx.notificationRecipient.update({
      where: { id: recipient.id },
      data: {
        email: input.newEmail,
        emailNormalized: input.newEmail,
        isSuppressed: false,
        suppressionReason: null,
        lastSyncedAt: now,
        metadata: resolutionMetadata({
          existing: recipient.metadata,
          recipientId: recipient.id,
          oldEmail,
          newEmail: input.newEmail,
          resolvedAt,
          resolvedByUserId: adminUserId,
          sourceLabel: source.label,
          sourceUpdated: source.updated,
          resendConfirmed: input.confirmedResendRemoval,
          retryDispatchId: replacementId,
          retryOfDispatchId: originalId,
        }),
      },
    });
    await tx.messageThread.updateMany({
      where: { recipientId: recipient.id },
      data: { contactEmail: input.newEmail, emailNormalized: input.newEmail },
    });
    await updateLinkedRecipients({
      tx,
      mainRecipientId: recipient.id,
      references: [
        ...source.references,
        ...(recipient.sourceId
          ? [{ sourceType: recipient.sourceType, sourceId: recipient.sourceId }]
          : []),
      ],
      oldEmail,
      newEmail: input.newEmail,
      resolvedAt,
      resolvedByUserId: adminUserId,
      resendConfirmed: input.confirmedResendRemoval,
    });

    return {
      recipientName: recipient.displayName?.trim() || input.newEmail,
      sourceUpdated: source.updated,
      retryDispatchId: replacementId,
    };
  });
}
