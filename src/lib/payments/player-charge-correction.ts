import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe/client";
import { lockLedgerFees, money, readPlayerLedgerState, setLedgerContext } from "./player-ledger";
import { LEDGER_TRANSACTION_PREFIX } from "./player-ledger-markers";

export class PlayerChargeCorrectionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const fail = (message: string): never => { throw new PlayerChargeCorrectionError(message); };
const correctionKey = (id: string) => `original-charge-correction:${id}`;
type Db = Pick<typeof prisma, "$queryRaw" | "$executeRaw" | "user" | "playerMatchFee" | "paymentCharge" | "playerLedgerEntry" | "paymentTransaction" | "playerRepaymentRequest">;
type Transaction = { id: string; teamId: string; chargeId: string | null; amountPence: number;
  method: string; reference: string | null; notes: string | null; paidAt: Date;
  stripePaymentIntentId: string | null; stripeCheckoutSessionId: string | null; playerMatchFeeId: string | null };

/** Rechecked in the transaction as well as at the HTTP/page boundary. Never
 * accept an isAdmin flag or actor id from a request body. No development bypass. */
export async function assertPlayerChargeCorrectionAdmin(actorUserId: string, db: Db = prisma) {
  const user = actorUserId ? await db.user.findUnique({ where: { id: actorUserId }, select: { id: true, role: true } }) : null;
  if (!user || user.role !== "ADMIN") throw new PlayerChargeCorrectionError("Administrator access is required.", 403);
}

async function loadCandidate(feeId: string, db: Db = prisma) {
  const fee = await db.playerMatchFee.findUnique({ where: { id: feeId }, include: {
    team: { select: { name: true } }, fixture: { select: { publishedAt: true, status: true, kickoffAt: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } } },
  } });
  const state = await readPlayerLedgerState(feeId, db);
  if (!fee || !state || state.deletedAt || fee.teamId !== state.teamId || fee.fixtureId !== state.fixtureId) return fail("The original player charge could not be matched safely.");
  if (fee.status !== "PAID" || state.controlled || state.planId || state.balancePence !== 0 || state.receivedPence !== 0 || state.captainReceivedPence !== 0) return fail("This control is for historical paid charges not yet reconciled to the receipt ledger. Refresh the player account.");
  if (!fee.fixture.publishedAt || ["CANCELLED", "POSTPONED"].includes(fee.fixture.status)) return fail("This fixture is not available for a historical charge correction.");
  if (/cap applied|waiv|credit|concession|subsid|captain\/organiser marked/i.test(fee.note ?? "")) return fail("This record contains an adjustment or concession. Review it separately; this control must not undo genuine allowances.");
  if (fee.teamMemberId) {
    const profiles = await db.$queryRaw<Array<{ override: number | null; cap: number | null }>>(Prisma.sql`
      SELECT (to_jsonb(p)->>'playerMatchFeePenceOverride')::integer AS override,
        (to_jsonb(p)->>'playerMatchFeeCapPence')::integer AS cap
      FROM "TeamMemberProfile" p WHERE "teamMemberId"=${fee.teamMemberId}`);
    if (profiles.some(p => p.override !== null || p.cap !== null)) return fail("This player has a fee override or cap. Review the concession before correcting a historical balance.");
  }
  const assigned = (await db.$queryRaw<Array<{ amount: number | null }>>(Prisma.sql`
    SELECT "captainAssignedAmountPence" AS amount FROM "PlayerMatchFee" WHERE id=${feeId}`))[0]?.amount ?? fee.amountPence;
  const charges = await db.paymentCharge.findMany({ where: { teamId: fee.teamId, fixtureId: fee.fixtureId, status: { not: "VOID" } }, select: { id: true, amountPence: true }, orderBy: { id: "asc" } });
  if (charges.length !== 1 || charges[0].amountPence <= 0) return fail("One unambiguous active team charge is required for this original fixture.");
  const entries = await db.playerLedgerEntry.findMany({ where: { feeId }, orderBy: { sequence: "asc" } });
  if (entries.reduce((sum, e) => sum + e.amountPence, 0) !== 0 || entries.some(e => /WAIVER|CAPTAIN_RECEIPT|REFUND|CORRECTION/.test(e.kind))) return fail("The historical statement contains an adjustment or does not balance. It needs a separate review.");
  // The structured fee id is authoritative. Exact old note references are used
  // only for legacy receipts where that column was never populated.
  const transactions = await db.$queryRaw<Transaction[]>(Prisma.sql`
    SELECT id,"teamId","chargeId","amountPence",method::text,reference,notes,"paidAt",
      "stripePaymentIntentId","stripeCheckoutSessionId","playerMatchFeeId"
    FROM "PaymentTransaction" WHERE "playerMatchFeeId"=${feeId}
      OR ("playerMatchFeeId" IS NULL AND notes LIKE ${`%Player fee ID: ${feeId}%`}) ORDER BY id`);
  if (!transactions.length || transactions.length > 20) return fail("Existing linked Stripe receipts are required. No new payment can be invented by a correction.");
  for (const t of transactions) {
    const noteId = /Player fee ID: ([A-Za-z0-9_-]+)(?:[.\s]|$)/.exec(t.notes ?? "")?.[1];
    if (t.teamId !== fee.teamId || (t.chargeId && t.chargeId !== charges[0].id) || (!t.playerMatchFeeId && noteId !== feeId)
      || t.method !== "STRIPE" || t.amountPence <= 0 || !t.stripePaymentIntentId || !t.stripeCheckoutSessionId) return fail("A receipt is missing its exact original fee, team, fixture or Stripe reference.");
  }
  const intents = transactions.map(t => t.stripePaymentIntentId!);
  if (new Set(intents).size !== intents.length) return fail("Duplicate payment references require reconciliation first.");
  const matching = await db.paymentTransaction.count({ where: { OR: [{ stripePaymentIntentId: { in: intents } }, { stripeCheckoutSessionId: { in: transactions.map(t => t.stripeCheckoutSessionId!) } }] } });
  if (matching !== transactions.length) return fail("A receipt is also allocated elsewhere. No balances have been changed.");
  const requests = await db.playerRepaymentRequest.count({ where: { OR: [{ feeId }, { paymentIntentId: { in: intents } }, { checkoutSessionId: { in: transactions.map(t => t.stripeCheckoutSessionId!) } }] } });
  if (requests) return fail("A checkout or receipt arrangement already exists. Review that before making a historical correction.");
  const receivedPence = transactions.reduce((sum, t) => sum + t.amountPence, 0);
  if (receivedPence !== fee.amountPence) return fail("Stored paid amount and linked receipts disagree. Investigate the payment history before using this control.");
  return { fee, state, assigned, charge: charges[0], entries, transactions, receivedPence };
}
type Candidate = Awaited<ReturnType<typeof loadCandidate>>;
const fingerprint = (c: Candidate) => createHash("sha256").update(JSON.stringify(c, (_key, value) => typeof value === "bigint" ? value.toString() : value)).digest("hex");
function secret() {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("A signing secret is required for charge corrections.");
  return value;
}
type Confirmation = { id: string; actorUserId: string; feeId: string; teamId: string; originalPence: number;
  receivedPence: number; reason: string; fingerprint: string; expiresAt: number };
function sign(data: Confirmation) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}
function readConfirmation(token: string, actorUserId: string, feeId: string): Confirmation {
  if (typeof token !== "string" || token.length > 10000) return fail("Invalid correction preview.");
  const parts = token.split(".");
  if (parts.length !== 2) return fail("Invalid correction preview.");
  const expected = createHmac("sha256", secret()).update(parts[0]).digest();
  const actual = Buffer.from(parts[1], "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return fail("Correction preview was changed. Preview again.");
  const value = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Confirmation;
  if (value.actorUserId !== actorUserId || value.feeId !== feeId || value.expiresAt < Date.now()) return fail("This preview has expired or belongs to another administrator or fee. Preview again.");
  return value;
}

/** GET-only provider checks. Do not call settlement/refund/checkout creation
 * here: this is historical reconciliation, not another payment. */
async function verifyReceipts(c: Candidate, stripe: ReturnType<typeof getStripeServerClient>) {
  for (const t of c.transactions) {
    const session = await stripe.checkout.sessions.retrieve(t.stripeCheckoutSessionId!);
    const intent = await stripe.paymentIntents.retrieve(t.stripePaymentIntentId!);
    const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    const latestCharge = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    if (session.mode !== "payment" || session.status !== "complete" || session.payment_status !== "paid" || session.currency !== "gbp"
      || session.amount_total !== t.amountPence || intentId !== intent.id || intent.id !== t.stripePaymentIntentId
      || intent.status !== "succeeded" || intent.currency !== "gbp" || intent.amount_received !== t.amountPence || !latestCharge
      || session.metadata?.playerMatchFeeId !== c.fee.id || session.metadata?.teamId !== c.fee.teamId || session.metadata?.fixtureId !== c.fee.fixtureId
      || intent.metadata?.playerMatchFeeId !== c.fee.id || intent.metadata?.teamId !== c.fee.teamId || intent.metadata?.fixtureId !== c.fee.fixtureId) return fail("Stripe did not verify an exact successful receipt for this original player charge.");
    const charge = await stripe.charges.retrieve(latestCharge);
    if (charge.status !== "succeeded" || !charge.paid || !charge.captured || charge.currency !== "gbp" || charge.amount_captured !== t.amountPence
      || charge.amount_refunded !== 0 || charge.refunded || charge.disputed || charge.payment_intent !== intent.id) return fail("A receipt has a refund, dispute or capture mismatch. Review it separately before changing the debt.");
  }
}

export async function getOriginalChargeCorrectionCandidate(feeId: string, actorUserId: string) {
  await assertPlayerChargeCorrectionAdmin(actorUserId);
  const c = await loadCandidate(feeId);
  return { feeId, teamId: c.fee.teamId, teamName: c.fee.team.name, playerName: c.state.playerName ?? "Player",
    fixtureLabel: `${c.fee.fixture.homeTeam.name} vs ${c.fee.fixture.awayTeam.name}`,
    kickoffAt: c.fee.fixture.kickoffAt.toISOString(), assignedPence: c.assigned, receivedPence: c.receivedPence };
}

export async function previewOriginalPlayerCharge(input: { feeId: string; actorUserId: string; originalPence: number; reason: string; noWaiver: boolean }, stripe = getStripeServerClient()) {
  await assertPlayerChargeCorrectionAdmin(input.actorUserId);
  const reason = input.reason.trim();
  if (!input.noWaiver || reason.length < 10 || reason.length > 1000) return fail("Confirm that no balance was forgiven and enter a reason of 10–1,000 characters.");
  const c = await loadCandidate(input.feeId);
  if (!Number.isSafeInteger(input.originalPence) || input.originalPence > 500000 || input.originalPence <= c.receivedPence) return fail("The correct original charge must exceed the verified payments and be no more than £5,000.");
  await verifyReceipts(c, stripe);
  const data: Confirmation = { id: randomUUID(), actorUserId: input.actorUserId, feeId: c.fee.id, teamId: c.fee.teamId,
    originalPence: input.originalPence, receivedPence: c.receivedPence, reason, fingerprint: fingerprint(c), expiresAt: Date.now() + 10 * 60_000 };
  return { token: sign(data), originalPence: data.originalPence, receivedPence: data.receivedPence,
    outstandingPence: data.originalPence - data.receivedPence, reason, expiresAt: data.expiresAt };
}

export async function confirmOriginalPlayerCharge(input: { feeId: string; actorUserId: string; token: string }, stripe = getStripeServerClient()) {
  await assertPlayerChargeCorrectionAdmin(input.actorUserId);
  const p = readConfirmation(input.token, input.actorUserId, input.feeId);
  const existing = await prisma.playerLedgerEntry.findUnique({ where: { sourceKey: correctionKey(p.id) } });
  if (existing) return { teamId: p.teamId, feeId: p.feeId, outstandingPence: existing.balanceAfterPence, alreadySaved: true };
  try {
  const snapshot = await loadCandidate(p.feeId);
  if (fingerprint(snapshot) !== p.fingerprint) return fail("The charge or its payments changed since preview. Preview again; nothing was changed.");
  await verifyReceipts(snapshot, stripe);
  return await prisma.$transaction(async db => {
    await assertPlayerChargeCorrectionAdmin(input.actorUserId, db);
    await db.$queryRaw(Prisma.sql`SELECT id FROM "Team" WHERE id=${p.teamId} FOR UPDATE`);
    await lockLedgerFees(db, [p.feeId]);
    const repeated = await db.playerLedgerEntry.findUnique({ where: { sourceKey: correctionKey(p.id) } });
    if (repeated) return { teamId: p.teamId, feeId: p.feeId, outstandingPence: repeated.balanceAfterPence, alreadySaved: true };
    await db.$queryRaw(Prisma.sql`SELECT id FROM "PaymentTransaction" WHERE id IN (${Prisma.join(snapshot.transactions.map(t => t.id))}) ORDER BY id FOR UPDATE`);
    const c = await loadCandidate(p.feeId, db);
    if (fingerprint(c) !== p.fingerprint) return fail("The balance changed during verification. Preview again; no correction was saved.");
    const balance = p.originalPence - c.receivedPence;
    // Adopt the SAME receipts into the shared ledger allocation mechanism. Never
    // insert a second PaymentTransaction or modify its amount/provider reference.
    for (const t of c.transactions) {
      const id = `historical-${t.id}`;
      await db.playerRepaymentRequest.create({ data: { id, teamId: p.teamId, feeId: p.feeId, status: "PAID",
        amountPence: t.amountPence, dueAt: t.paidAt, expiresAt: t.paidAt, paidAt: t.paidAt,
        checkoutSessionId: t.stripeCheckoutSessionId, paymentIntentId: t.stripePaymentIntentId,
        allocations: [{ feeId: p.feeId, fixtureId: c.fee.fixtureId, chargeId: c.charge.id, amountPence: t.amountPence, version: c.state.version }],
        failureReason: "Existing verified receipt adopted during admin charge correction; no new payment taken." } });
      await db.paymentTransaction.update({ where: { id: t.id }, data: { chargeId: c.charge.id,
        notes: `${LEDGER_TRANSACTION_PREFIX}. Historical receipt reconciled. Account fee reference: ${p.feeId}. Request: ${id}.` } });
    }
    await db.playerFeeLedgerState.update({ where: { feeId: p.feeId }, data: { controlled: true, collectionPaused: true } });
    await setLedgerContext(db, { feeId: p.feeId, actorUserId: input.actorUserId, kind: "ORIGINAL_CHARGE_CORRECTION",
      receiptPence: c.receivedPence, receivedBy: "SIXFL", sourceKey: correctionKey(p.id),
      reason: `Original charge confirmed as ${money(p.originalPence)}; existing Stripe receipts ${money(c.receivedPence)} retained once; ${money(balance)} restored outstanding. No waiver. ${p.reason} Collection remains paused; no message or new payment.`,
      reference: JSON.stringify({ originalPence: p.originalPence, previousAmountPence: c.fee.amountPence, previousAssignedPence: c.assigned,
        previousStatus: c.fee.status, previousBalancePence: c.state.balancePence, receipts: c.transactions }) });
    // One write/trigger invocation: the context adopts prior receipts once.
    await db.$executeRaw(Prisma.sql`UPDATE "PlayerMatchFee" SET "amountPence"=${balance}, status='OPEN', "paidAt"=NULL,
      "waivedAt"=NULL, "cancelledAt"=NULL, "captainAssignedAmountPence"=${p.originalPence}, "updatedAt"=NOW() WHERE id=${p.feeId}`);
    const after = await readPlayerLedgerState(p.feeId, db);
    if (!after || after.balancePence !== balance || after.receivedPence !== c.receivedPence) throw new Error("Correction did not balance; transaction rolled back.");
    return { teamId: p.teamId, feeId: p.feeId, outstandingPence: balance, alreadySaved: false };
  }, { maxWait: 5000, timeout: 20000 });
  } catch (error) {
    // Another confirmation can finish while this request is verifying provider
    // receipts. The signed nonce identifies that same save, not a new adjustment.
    const saved = await prisma.playerLedgerEntry.findUnique({ where: { sourceKey: correctionKey(p.id) } });
    if (saved) return { teamId: p.teamId, feeId: p.feeId, outstandingPence: saved.balanceAfterPence, alreadySaved: true };
    throw error;
  }
}
