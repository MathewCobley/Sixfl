import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { money, playerFeeCollectionHold, readPlayerLedgerState } from "@/lib/payments/player-ledger";
import { queueNotificationFromTemplate } from "./service";
import { PLAYER_PAYMENT_RESEND_TEMPLATES } from "./player-payment-resend-policy";

export class PlayerPaymentResendError extends Error {}
type Db = Pick<typeof prisma, "teamMember" | "playerMatchFee" | "notificationRecipient" | "$queryRaw">;
type Context = { teamId: string; membershipId: string; feeId: string; recipientId: string; expectedEmail: string };
const email = (value: string | null | undefined) => value?.trim().toLowerCase() || "";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function blocked(message: string): never { throw new PlayerPaymentResendError(message); }

/** Read-only safety check, reused immediately before provider delivery. An old
 * payment demand is never replayed against a changed balance, player or link. */
async function readPaymentContext(input: Context, db: Db = prisma) {
  const [member, fee, recipient] = await Promise.all([
    db.teamMember.findFirst({ where: { id: input.membershipId, teamId: input.teamId },
      select: { id: true, userId: true, user: { select: { email: true } } } }),
    db.playerMatchFee.findUnique({ where: { id: input.feeId }, select: {
      id: true, teamId: true, teamMemberId: true, prospectId: true, status: true,
      amountPence: true, paymentToken: true, paymentUrl: true,
      fixture: { select: { id: true, status: true, publishedAt: true,
        homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } } },
      team: { select: { name: true, logoUrl: true, league: { select: { name: true, season: true } } } },
    } }),
    db.notificationRecipient.findUnique({ where: { id: input.recipientId }, include: { preferences: true } }),
  ]);
  if (!member || !fee || fee.teamId !== input.teamId) blocked("This payment request does not belong to this player and team.");
  if (fee.teamMemberId !== member.id) {
    // A source prospect is usable only when it maps unambiguously to this user.
    // Never infer ownership from a shared email or a similar player name.
    if (fee.teamMemberId || !fee.prospectId) blocked("This fee is not linked to this squad member. Review the player's payment record first.");
    const owners = await db.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      SELECT DISTINCT member."userId" FROM "TeamMemberProfile" profile
      JOIN "TeamMember" member ON member.id=profile."teamMemberId"
      WHERE profile."sourceProspectId"=${fee.prospectId} AND member."teamId"=${input.teamId}
    `);
    if (owners.length !== 1 || owners[0].userId !== member.userId) blocked("This historical fee cannot be safely linked to this player.");
  }
  if (fee.status !== "OPEN" || fee.amountPence <= 0) blocked("This payment is paid, waived or cancelled. No payment email was queued.");
  if (!fee.fixture.publishedAt || fee.fixture.status === "CANCELLED") blocked("This match is unpublished or cancelled. Review the payment before resending.");
  if (!fee.paymentToken || !fee.paymentUrl) blocked("There is no active payment link. Review the player's payment record first.");
  if (!input.expectedEmail || email(member.user.email) !== email(input.expectedEmail) ||
      !recipient || email(recipient.email) !== email(input.expectedEmail)) {
    blocked("The player's email address has changed. Refresh and review the current payment details before sending.");
  }
  if (recipient.isSuppressed || !recipient.transactionalEmailOptIn || !recipient.preferences?.emailEnabled) {
    blocked("Email delivery is disabled or suppressed for this recipient. No payment email was queued.");
  }
  const hold = await playerFeeCollectionHold(fee.id, db);
  if (hold) blocked(hold);
  const ledger = await readPlayerLedgerState(fee.id, db);
  if (ledger && (ledger.deletedAt || (ledger.userId && ledger.userId !== member.userId))) blocked("The payment account needs review before resending.");
  const amountPence = ledger?.balancePence ?? fee.amountPence;
  if (amountPence <= 0) blocked("This player balance is settled. No payment email was queued.");
  return { fee, amountPence, ledgerVersion: ledger?.version ?? null };
}

export async function queuePlayerPaymentEmailResend(input: {
  teamId: string; membershipId: string; referenceType: "message" | "dispatch";
  referenceId: string; expectedEmail: string; actorUserId: string;
}) {
  if (!input.teamId || !input.membershipId || !input.referenceId || !input.actorUserId || !input.expectedEmail) {
    blocked("The original payment email, player and administrator are required.");
  }
  // Resolve only stored identifiers. Browser-supplied subjects, payment amounts,
  // template names and links are deliberately not part of this API.
  const message = input.referenceType === "message" ? await prisma.messageEntry.findFirst({
    where: { id: input.referenceId, channel: "EMAIL", direction: "OUTBOUND" },
    select: { notificationDispatchId: true, toEmail: true, sentAt: true },
  }) : null;
  if (input.referenceType === "message" && (!message?.sentAt || email(message.toEmail) !== email(input.expectedEmail))) {
    blocked("Only a sent payment email to this player can be resent.");
  }
  const dispatchId = input.referenceType === "message" ? message?.notificationDispatchId : input.referenceId;
  if (!dispatchId) blocked("The original email has no payment notification record.");
  const original = await prisma.notificationDispatch.findUnique({ where: { id: dispatchId }, include: { template: true } });
  if (!original || original.channel !== "EMAIL" || original.status !== "SENT" || !original.sentAt || !original.sourceId ||
      !original.sourceType || !Object.hasOwn(PLAYER_PAYMENT_RESEND_TEMPLATES, original.sourceType) || !original.template ||
      original.template.key !== PLAYER_PAYMENT_RESEND_TEMPLATES[original.sourceType] || original.template.kind !== "TRANSACTIONAL" || original.template.channel !== "EMAIL") {
    blocked("This is not a supported sent player payment email. The original message has not been changed.");
  }
  const sourceType = original.sourceType;
  const templateKey = original.template.key;
  const originalVariables = record(original.variables);
  const context: Context = { teamId: input.teamId, membershipId: input.membershipId,
    feeId: original.sourceId, recipientId: original.recipientId, expectedEmail: email(input.expectedEmail) };
  return prisma.$transaction(async (db) => {
    // The text cast avoids exposing PostgreSQL's void return type to Prisma.
    // Transaction-scoped locking serialises retries across admins and instances.
    await db.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`player-payment-resend:${context.feeId}`},0))::text`);
    const current = await readPaymentContext(context, db);
    if (originalVariables.amount !== money(current.amountPence) || originalVariables.paymentUrl !== current.fee.paymentUrl) {
      blocked("The amount or payment link has changed since this email. Use the current player payment request instead of resending the old one.");
    }
    const recent = await db.notificationDispatch.findFirst({
      where: { channel: "EMAIL", sourceId: context.feeId, sourceType: { in: Object.keys(PLAYER_PAYMENT_RESEND_TEMPLATES) },
        OR: [ { status: { in: ["QUEUED", "PROCESSING"] } },
          { status: "SENT", createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
            metadata: { path: ["playerPaymentTimelineResend"], equals: true } } ],
      }, orderBy: { createdAt: "desc" }, select: { id: true, status: true },
    });
    if (recent) return { dispatchId: recent.id, status: recent.status, reused: true };
    const variables: Record<string, string> = {};
    for (const [key, value] of Object.entries(originalVariables)) if (typeof value === "string") variables[key] = value;
    const league = current.fee.team.league;
    // Preserve the original source type/id so existing delivery and payment
    // cancellation safeguards recognise this as a payment request.
    const dispatch = await queueNotificationFromTemplate({
      templateKey, recipientId: original.recipientId, variables,
      sourceType, sourceId: context.feeId, createdByUserId: input.actorUserId,
      metadata: { origin: "player_payment_timeline_resend", originLabel: "Resent player payment email",
        playerPaymentTimelineResend: true, originalDispatchId: original.id,
        ...(input.referenceType === "message" ? { originalMessageId: input.referenceId } : {}),
        teamId: context.teamId, teamMemberId: context.membershipId, fixtureId: current.fee.fixture.id,
        playerMatchFeeId: context.feeId, resendRecipientEmail: context.expectedEmail,
        resendAmountPence: current.amountPence, resendLedgerVersion: current.ledgerVersion,
        resendFeeAmountPence: current.fee.amountPence,
        paymentUrl: current.fee.paymentUrl, actorRole: "ADMIN" },
      emailBranding: { teamName: current.fee.team.name, teamLogoUrl: current.fee.team.logoUrl,
        leagueName: league ? `${league.name}${league.season ? ` · ${league.season}` : ""}` : "" },
      paymentSummary: { amount: money(current.amountPence),
        reason: `${current.fee.fixture.homeTeam.name} vs ${current.fee.fixture.awayTeam.name}` },
    }, db);
    if (dispatch.status !== "QUEUED") blocked(dispatch.failureReason || "The notification system did not queue this email.");
    return { dispatchId: dispatch.id, status: dispatch.status, reused: false };
  }, { maxWait: 5000, timeout: 15000 });
}

export async function getPlayerPaymentResendDeliveryBlock(dispatch: {
  channel: string; sourceType: string | null; sourceId: string | null; recipientId: string;
  metadata: unknown; recipient: { email: string | null };
}) {
  const meta = record(dispatch.metadata);
  if (meta.playerPaymentTimelineResend !== true) return null;
  if (dispatch.channel !== "EMAIL" || !dispatch.sourceType || !Object.hasOwn(PLAYER_PAYMENT_RESEND_TEMPLATES, dispatch.sourceType) ||
      !dispatch.sourceId || typeof meta.teamId !== "string" || typeof meta.teamMemberId !== "string" ||
      typeof meta.resendRecipientEmail !== "string" || email(dispatch.recipient.email) !== meta.resendRecipientEmail) {
    return "Payment resend has missing or changed recipient/context information.";
  }
  try {
    const current = await readPaymentContext({ teamId: meta.teamId, membershipId: meta.teamMemberId,
      feeId: dispatch.sourceId, recipientId: dispatch.recipientId, expectedEmail: meta.resendRecipientEmail });
    if (current.amountPence !== meta.resendAmountPence || current.fee.paymentUrl !== meta.paymentUrl ||
        current.fee.amountPence !== meta.resendFeeAmountPence || current.ledgerVersion !== meta.resendLedgerVersion) {
      return "Payment details changed after the resend was queued. Outdated payment email cancelled.";
    }
    return null;
  } catch (error) {
    if (error instanceof PlayerPaymentResendError) return error.message;
    throw error; // Database failures must fail closed, never reach the provider.
  }
}
