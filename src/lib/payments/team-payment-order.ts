import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getRelatedTeamIdsForPaymentLedger,
  getTeamPaymentLedger,
  type TeamPaymentLedger,
} from "@/lib/payments/team-payment-ledger";
import {
  activePaymentOrderExceptions, decideTeamPaymentOrder, oldestPaymentOrderEntry,
  overduePaymentOrderEntries, paymentOrderMessage,
  type PaymentOrderException,
} from "./team-payment-order-policy";

export async function getTeamPaymentOrder(teamId: string, existingLedger?: TeamPaymentLedger) {
  const [identity, ledger] = await Promise.all([
    getRelatedTeamIdsForPaymentLedger(teamId),
    existingLedger ?? getTeamPaymentLedger(teamId),
  ]);
  if (!identity || !ledger) throw new Error("Unable to confirm this team's payment order.");
  const enabled = identity.team.teamMode === "STANDARD";
  const fixtureIds = [...new Set(ledger.entries.flatMap(entry => entry.fixtureId ? [entry.fixtureId] : []))];
  const [fixtures, exceptions] = await Promise.all([
    fixtureIds.length ? prisma.fixture.findMany({ where: { id: { in: fixtureIds } }, select: { id: true, status: true } }) : [],
    enabled && ledger.entries.length ? prisma.$queryRaw<PaymentOrderException[]>(Prisma.sql`
      SELECT DISTINCT ON ("chargeId") "chargeId", "action", "reason", "expiresAt"
      FROM "TeamPaymentOrderException"
      WHERE "chargeId" IN (${Prisma.join(ledger.entries.map(entry => entry.chargeId))})
      ORDER BY "chargeId", "id" DESC
    `) : [],
  ]);
  const fixtureStatus = new Map(fixtures.map(fixture => [fixture.id, fixture.status as string]));
  const unavailableChargeIds = new Set(ledger.entries.filter(entry => entry.fixtureId
    && !["SCHEDULED", "COMPLETED"].includes(fixtureStatus.get(entry.fixtureId) ?? "MISSING"))
    .map(entry => entry.chargeId));
  const boundary = identity.team.standardCreditStartedAt;
  const eligibleEntries = ledger.entries.filter(entry => !unavailableChargeIds.has(entry.chargeId)
    && (!boundary || (entry.kickoffAt ?? entry.dueDate ?? entry.createdAt) >= boundary));
  const eligibleChargeIds = new Set(eligibleEntries.map(entry => entry.chargeId));
  const activeExceptions = activePaymentOrderExceptions(exceptions);
  const policy = { entries: ledger.entries, eligibleChargeIds, unavailableChargeIds, exceptions: activeExceptions, enabled };
  return {
    ledger,
    enabled,
    next: enabled ? oldestPaymentOrderEntry(eligibleEntries, activeExceptions) : null,
    overdue: enabled ? overduePaymentOrderEntries(eligibleEntries) : [],
    exceptions: activeExceptions,
    decision: (chargeId: string) => decideTeamPaymentOrder({ ...policy, chargeId }),
  };
}

export type TeamPaymentOrder = Awaited<ReturnType<typeof getTeamPaymentOrder>>;

export class TeamPaymentOrderError extends Error {
  constructor(public readonly decision: ReturnType<TeamPaymentOrder["decision"]>) {
    super(paymentOrderMessage(decision));
    this.name = "TeamPaymentOrderError";
  }
}

/** Server-owned guard. No request/query parameter can exempt a direct payment. */
export async function assertTeamChargePaymentOrder(chargeId: string) {
  const charge = await prisma.paymentCharge.findUnique({ where: { id: chargeId }, select: { teamId: true } });
  if (!charge) throw new Error("Charge not found.");
  const order = await getTeamPaymentOrder(charge.teamId);
  const decision = order.decision(chargeId);
  if (!decision.allowed) throw new TeamPaymentOrderError(decision);
  return order;
}
