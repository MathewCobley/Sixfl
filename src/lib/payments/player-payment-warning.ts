import { playerFeeCollectionHold } from "./player-ledger";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { buildQueuedContentFromTemplate, queueNotificationFromTemplate, resolveScheduledFor } from "@/lib/notifications/service";
import { extractNotificationTokens } from "@/lib/notifications/renderer";
import { shortenSmsBodyLinks } from "@/lib/notifications/sms-short-links";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { buildPlayerMatchFeePaymentUrl } from "@/lib/payments/player-match-fees";
import { isCaptainCollectionActiveNote, isCaptainCollectionRemovedNote } from "@/lib/payments/captain-collected-remittance";
import { createWarningTicket, readWarningTicket, parseWarningDeadline, warningChannel, warningFingerprint,
  PaymentWarningError, PLAYER_PAYMENT_WARNING_SOURCE as SOURCE, WARNING_COOLDOWN_MS, WARNING_TEMPLATE_KEYS, type WarningChannel } from "./player-payment-warning-policy";

type Db = Pick<typeof prisma, "$queryRaw" | "playerMatchFee" | "notificationDispatch" | "notificationRecipient" | "notificationPreference" | "notificationTemplate">;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const emailAddress = (value?: string | null) => value?.trim().toLowerCase() || null;
const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const dateLabel = (date: Date) => formatDateTimeInLondon(date, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

/** Read-only: never repair links, reconcile charges, spend credit, or change fees. */
export async function loadPlayerPaymentWarningTarget(feeId: string, db: Db = prisma) {
  const fee = await db.playerMatchFee.findUnique({ where: { id: feeId }, select: {
    id: true, teamId: true, fixtureId: true, teamMemberId: true, prospectId: true, amountPence: true,
    status: true, paidAt: true, waivedAt: true, cancelledAt: true, note: true, paymentUrl: true, paymentToken: true,
    team: { select: { id: true, name: true, logoUrl: true } },
    fixture: { select: { id: true, status: true, publishedAt: true, kickoffAt: true,
      homeTeamId: true, awayTeamId: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
      league: { select: { name: true, season: true } } } },
    teamMember: { select: { id: true, teamId: true, user: { select: { id: true, name: true, email: true } } } },
    prospect: { select: { id: true, teamId: true, firstName: true, lastName: true, email: true, phone: true } },
  } });
  if (!fee) throw new PaymentWarningError("This player fee could not be found.");
  const collectionHold=await playerFeeCollectionHold(fee.id,db);
  if(collectionHold)throw new PaymentWarningError(collectionHold);
  if (fee.status !== "OPEN" || fee.amountPence <= 0 || fee.paidAt || fee.waivedAt || fee.cancelledAt || isCaptainCollectionActiveNote(fee.note) || isCaptainCollectionRemovedNote(fee.note)) throw new PaymentWarningError("This fee is paid, waived, cancelled, or not owed through a player payment link. No warning can be sent.");
  if (!fee.fixture.publishedAt || fee.fixture.status === "CANCELLED" || ![fee.fixture.homeTeamId, fee.fixture.awayTeamId].includes(fee.teamId)) throw new PaymentWarningError("This fee is not attached to a current published match for this team.");
  if ((!fee.teamMember && !fee.prospect) || (fee.teamMember && fee.teamMember.teamId !== fee.teamId) || (!fee.teamMember && fee.prospect?.teamId !== fee.teamId)) throw new PaymentWarningError("Review the player's fee/contact linkage before sending a warning.");
  if (!fee.paymentToken || !fee.paymentUrl) throw new PaymentWarningError("This fee needs a valid existing payment link before it can be chased.");
  const paymentUrl = buildPlayerMatchFeePaymentUrl(fee.paymentToken);
  try {
    const saved = new URL(fee.paymentUrl), expected = new URL(paymentUrl);
    if (saved.pathname !== expected.pathname || saved.search || saved.hash || saved.username || saved.password || saved.protocol !== expected.protocol || saved.host.replace(/^www\./, "") !== expected.host.replace(/^www\./, "")) throw new Error("mismatch");
  } catch { throw new PaymentWarningError("The saved payment link needs review; no warning was prepared."); }
  const profile = fee.teamMemberId ? (await db.$queryRaw<Array<{ phone: string | null }>>(Prisma.sql`SELECT "phone" FROM "TeamMemberProfile" WHERE "teamMemberId" = ${fee.teamMemberId} LIMIT 1`))[0] : null;
  const email = emailAddress(fee.teamMember ? fee.teamMember.user.email : fee.prospect?.email);
  const phone = normalizePhoneNumber(fee.teamMember ? profile?.phone : fee.prospect?.phone);
  const playerName = fee.teamMember ? fee.teamMember.user.name?.trim() : [fee.prospect?.firstName, fee.prospect?.lastName].filter(Boolean).join(" ").trim();
  if (!playerName) throw new PaymentWarningError("Save the player's name before sending a payment warning.");
  const recipientSourceId = `player-match-fee:${fee.id}`;
  // Opt-outs on another record for the same contact are not bypassed by making
  // a new per-fee recipient. Only the explicitly selected permitted channel is used.
  const recipients = await db.notificationRecipient.findMany({ where: { OR: [
    { sourceType: "GENERAL", sourceId: recipientSourceId },
    ...(email ? [{ emailNormalized: email }, { email: { equals: email, mode: "insensitive" as const } }] : []),
    ...(phone ? [{ phoneNormalized: phone }, { phone }] : []),
  ] }, include: { preferences: true } });
  const suppressed = recipients.some(r => r.isSuppressed);
  const allowed = {
    EMAIL: Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !suppressed && !recipients.some(r => !r.transactionalEmailOptIn || r.preferences?.emailEnabled === false)),
    SMS: Boolean(phone && !suppressed && !recipients.some(r => !r.transactionalSmsOptIn || r.preferences?.smsEnabled === false)),
  };
  return { fee, playerName, email, phone, allowed, paymentUrl, recipientSourceId,
    amount: money(fee.amountPence), fixtureLabel: `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name} · ${dateLabel(fee.fixture.kickoffAt)}` };
}

async function prepare(feeId: string, channel: WarningChannel, deadline: Date, db: Db = prisma) {
  const target = await loadPlayerPaymentWarningTarget(feeId, db);
  if (!target.allowed[channel]) throw new PaymentWarningError(`This player's ${channel === "EMAIL" ? "email" : "SMS"} contact is missing, invalid, suppressed or opted out. Choose an available channel or review their contact preferences.`);
  const template = await db.notificationTemplate.findUnique({ where: { key: WARNING_TEMPLATE_KEYS[channel] } });
  if (!template?.isActive || template.channel !== channel || template.kind !== "TRANSACTIONAL" || template.audience !== "PLAYER") throw new PaymentWarningError("The payment warning template is missing, disabled or invalid. Review System Templates.");
  const { fee } = target;
  const variables = { firstName: target.playerName.split(/\s+/)[0], fullName: target.playerName, teamName: fee.team.name,
    fixtureLabel: target.fixtureLabel, amount: target.amount, paymentUrl: target.paymentUrl, deadline: dateLabel(deadline) };
  const emailBranding = { teamName: fee.team.name, teamLogoUrl: fee.team.logoUrl,
    leagueName: `${fee.fixture.league.name}${fee.fixture.league.season ? ` · ${fee.fixture.league.season}` : ""}` };
  const paymentSummary = { amount: target.amount, reason: target.fixtureLabel };
  const content = buildQueuedContentFromTemplate({ template, variables, emailBranding, paymentSummary });
  if ([content.subject, content.bodyText, content.bodyHtml].some(s => extractNotificationTokens(s ?? "").length)) throw new PaymentWarningError("The warning template has unresolved fields. Review System Templates before sending.");
  if (!content.bodyText.includes(target.paymentUrl) || !content.bodyText.includes(variables.deadline)) throw new PaymentWarningError("The warning template must include {{paymentUrl}} and {{deadline}} in its body.");
  const fingerprint = warningFingerprint({ feeId, teamId: fee.teamId, fixtureId: fee.fixtureId, memberId: fee.teamMemberId,
    prospectId: fee.prospectId, userId: fee.teamMember?.user.id, playerName: target.playerName,
    email: target.email, phone: target.phone, amountPence: fee.amountPence, paymentToken: fee.paymentToken,
    savedPaymentUrl: fee.paymentUrl, deadline: deadline.toISOString(), templateId: template.id, content });
  return { ...target, template, variables, emailBranding, paymentSummary, content, fingerprint };
}

function checkDeadlineForDelivery(deadline: Date, channel: WarningChannel, now: Date) {
  const scheduledFor = resolveScheduledFor({ channel, scheduledFor: now });
  if (deadline.getTime() < scheduledFor.getTime() + 3600000) throw new PaymentWarningError("Allow at least one hour after the message can be sent. SMS is held between 21:00 and 09:00 UK time.");
  return scheduledFor;
}
export async function previewPlayerPaymentWarning(input: { feeId: string; channel: unknown; deadlineLocal: unknown; actorId: string }, now = new Date()) {
  const channel = warningChannel(input.channel), deadline = parseWarningDeadline(input.deadlineLocal, now);
  const prepared = await prepare(input.feeId, channel, deadline);
  const scheduledFor = checkDeadlineForDelivery(deadline, channel, now);
  const previewToken = createWarningTicket({ actorId: input.actorId, feeId: input.feeId, channel, deadline: deadline.toISOString(), fingerprint: prepared.fingerprint }, now);
  return { previewToken, channel, playerName: prepared.playerName, recipient: channel === "EMAIL" ? prepared.email! : prepared.phone!,
    amount: prepared.amount, fixtureLabel: prepared.fixtureLabel, deadline: dateLabel(deadline), paymentUrl: prepared.paymentUrl,
    scheduledFor: dateLabel(scheduledFor), ...prepared.content };
}
export type PlayerPaymentWarningPreview = Awaited<ReturnType<typeof previewPlayerPaymentWarning>>;

function receipt(dispatch: { id: string; channel: string; status: string; scheduledFor: Date }, duplicate: boolean) {
  return { dispatchId: dispatch.id, channel: dispatch.channel, status: dispatch.status, scheduledFor: dateLabel(dispatch.scheduledFor), duplicate };
}
/** Explicit confirmation only. Row locking and request ID make double-clicks and
 * retries idempotent. No original fee, payment link, balance or sanction is changed. */
export async function sendPlayerPaymentWarning(input: { previewToken: unknown; actorId: string }, now = new Date()) {
  const ticket = readWarningTicket(input.previewToken, input.actorId, now);
  const result = await prisma.$transaction(async db => {
    await db.$queryRaw(Prisma.sql`SELECT "id" FROM "PlayerMatchFee" WHERE "id" = ${ticket.feeId} FOR UPDATE`);
    const duplicate = await db.notificationDispatch.findFirst({ where: { sourceType: SOURCE, sourceId: ticket.feeId,
      metadata: { path: ["warningRequestId"], equals: ticket.requestId } } });
    if (duplicate) return { dispatch: duplicate, duplicate: true, recipient: null };
    const prepared = await prepare(ticket.feeId, ticket.channel, new Date(ticket.deadline), db);
    if (prepared.fingerprint !== ticket.fingerprint) throw new PaymentWarningError("The fee, contact details or template changed after preview. Please preview again. Nothing was queued.");
    const scheduledFor = checkDeadlineForDelivery(new Date(ticket.deadline), ticket.channel, now);
    const previous = await db.notificationDispatch.findFirst({ where: { sourceType: SOURCE, sourceId: ticket.feeId, OR: [
      { status: { in: ["QUEUED", "PROCESSING"] } }, { sentAt: { gte: new Date(now.getTime() - WARNING_COOLDOWN_MS) } },
      { providerMessageId: { not: null }, sentAt: null },
    ] } });
    if (previous) throw new PaymentWarningError("A warning is already queued, needs delivery review, or was sent for this fee in the last 24 hours. Check the warning history.");
    const contact = { displayName: prepared.playerName, email: prepared.email, emailNormalized: prepared.email, phone: prepared.phone, phoneNormalized: prepared.phone, lastSyncedAt: now };
    const recipient = await db.notificationRecipient.upsert({ where: { sourceType_sourceId: { sourceType: "GENERAL", sourceId: prepared.recipientSourceId } },
      update: contact,
      create: { ...contact, sourceType: "GENERAL", sourceId: prepared.recipientSourceId, audience: "PLAYER",
        marketingEmailOptIn: false, marketingSmsOptIn: false, metadata: { playerMatchFeeId: ticket.feeId, teamId: prepared.fee.teamId, entityType: "PLAYER_MATCH_FEE" } } });
    await db.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
    const dispatch = await queueNotificationFromTemplate({ templateKey: prepared.template.key, recipientId: recipient.id,
      sourceType: SOURCE, sourceId: ticket.feeId, variables: prepared.variables, scheduledFor, createdByUserId: input.actorId,
      emailBranding: prepared.emailBranding, paymentSummary: prepared.paymentSummary,
      metadata: { origin: "individual_player_payment_warning", originLabel: "Individual player payment warning", playerMatchFeeId: ticket.feeId,
        teamId: prepared.fee.teamId, fixtureId: prepared.fee.fixtureId, contactName: prepared.playerName,
        warningRequestId: ticket.requestId, warningFingerprint: ticket.fingerprint, warningDeadline: ticket.deadline, warningChannel: ticket.channel } }, db);
    if (dispatch.status !== "QUEUED") throw new PaymentWarningError("The warning could not be queued. Review the contact's notification settings.");
    return { dispatch, recipient, duplicate: false };
  }, { maxWait: 5000, timeout: 15000 });
  if (result.recipient) {
    try { await logNotificationDispatchToThread({ dispatch: result.dispatch, recipient: result.recipient }); }
    catch (error) { console.error("Payment warning queued; history logging needs review", result.dispatch.id, error); }
  }
  return receipt(result.dispatch, result.duplicate);
}

type WarningDispatch = { id: string; channel: string; sourceType: string | null; sourceId: string | null; metadata: unknown;
  bodyText: string; bodyHtml: string | null; subject: string | null; sentAt: Date | null; providerMessageId: string | null;
  recipientId: string; recipient: { email: string | null; phone: string | null } };
/** Both provider branches call this immediately before submission, including
 * queue retries. A payment made while SMS waits overnight cancels the warning. */
export async function applyPlayerPaymentWarningDeliveryGate(dispatch: WarningDispatch, now = new Date()): Promise<string | null> {
  if (dispatch.sourceType !== SOURCE) return null;
  let reason: string | null = null;
  try {
    const meta = record(dispatch.metadata), deadline = new Date(String(meta.warningDeadline ?? ""));
    if (!dispatch.sourceId || !Number.isFinite(deadline.getTime()) || deadline <= now || dispatch.sentAt || dispatch.providerMessageId) throw new PaymentWarningError("Warning expired, is invalid, or already has provider-acceptance evidence; it will not be sent again.");
    const channel = warningChannel(dispatch.channel), prepared = await prepare(dispatch.sourceId, channel, deadline);
    if (prepared.fingerprint !== meta.warningFingerprint || channel !== meta.warningChannel) throw new PaymentWarningError("The fee, player contact, link or warning template changed; stale warning cancelled.");
    const recipient = await prisma.notificationRecipient.findUnique({ where: { id: dispatch.recipientId }, include: { preferences: true } });
    if (!recipient || recipient.isSuppressed || (channel === "EMAIL" ? !recipient.transactionalEmailOptIn || recipient.preferences?.emailEnabled !== true || prepared.email !== emailAddress(recipient.email) || prepared.email !== emailAddress(dispatch.recipient.email) : !recipient.transactionalSmsOptIn || recipient.preferences?.smsEnabled !== true || prepared.phone !== normalizePhoneNumber(recipient.phone) || prepared.phone !== normalizePhoneNumber(dispatch.recipient.phone))) throw new PaymentWarningError("Warning recipient changed or opted out; warning cancelled.");
    const shortened = channel === "SMS" ? shortenSmsBodyLinks({ dispatchId: dispatch.id, bodyText: prepared.content.bodyText, normaliseSmsText: value => value.trim() }) : null;
    const expectedText = shortened?.bodyText ?? prepared.content.bodyText;
    if (shortened && warningFingerprint(shortened.links) !== warningFingerprint(meta.smsShortLinks ?? [])) throw new PaymentWarningError("Queued warning payment destination changed; preview again.");
    if (expectedText !== dispatch.bodyText || prepared.content.bodyHtml !== dispatch.bodyHtml || prepared.content.subject !== dispatch.subject) throw new PaymentWarningError("Queued warning content changed after confirmation; preview again.");
    const scheduledFor = resolveScheduledFor({ channel, scheduledFor: now });
    if (scheduledFor > now) {
      if (scheduledFor >= deadline) throw new PaymentWarningError("SMS sending hours would be after the chosen deadline; warning cancelled.");
      await prisma.notificationDispatch.updateMany({ where: { id: dispatch.id, status: "PROCESSING" }, data: { status: "QUEUED", processedAt: null, scheduledFor } });
      return "Warning deferred until UK SMS sending hours.";
    }
    return null;
  } catch (error) {
    if (!(error instanceof PaymentWarningError)) throw error;
    reason = error.message;
  }
  await prisma.notificationDispatch.updateMany({ where: { id: dispatch.id, status: { in: ["QUEUED", "PROCESSING"] } }, data: { status: "CANCELLED", cancelledAt: now, failureReason: reason } });
  return reason;
}
