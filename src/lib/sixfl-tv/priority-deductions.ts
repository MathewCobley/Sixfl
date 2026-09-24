import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { summariseChargesWithPlayerMatchFees } from "@/lib/payments/charge-summary";
import { hydrateCaptainAssignedPlayerFees } from "@/lib/payments/player-fee-assigned-share";
import { getRelatedTeamIdsForPaymentLedger } from "@/lib/payments/team-payment-ledger";

export const PRIORITY_CONDUCT_DAYS = 28;
export const PRIORITY_OVERDUE_DAYS = 14;
export const PRIORITY_OVERDUE_POINTS = 10;
export const PRIORITY_SHIN_PAD_POINTS = 5;
export const PRIORITY_SHIN_PAD_CAP = 15;
export const PRIORITY_RED_CARD_CAP = 30;
const DAY = 86400000;
type Db = Pick<typeof prisma, "$queryRaw">;
export type PriorityDeduction = { id: string; kind: "OVERDUE" | "SHIN_PAD" | "RED_CARD"; points: number; label: string; recovery: string; expiresAt: Date | null; fixtureId: string | null };
export type PriorityReview = { id: string; teamId: string; kind: "PAYMENT_HOLD" | "SHIN_PAD_DISMISSED" | "RED_CARD"; referenceId: string; points: number; reason: string; createdAt: Date; createdBy: string; revokedAt: Date | null; revokedBy: string | null };
export type OverdueCharge = { id: string; teamId: string; title: string; dueDate: Date; outstandingPence: number; held: boolean };
type Charge = { id: string; teamId: string; fixtureId: string | null; title: string; amountPence: number; status: string; dueDate: Date };
type Fee = { id: string; teamId: string; fixtureId: string; amountPence: number; status: string; note: string | null };
type Incident = { id: string; teamId: string; fixtureId: string; at: Date; label: string; points: number };
export type PriorityDeductionDetails = { deductions: PriorityDeduction[]; deductionPoints: number; overdueCharges: OverdueCharge[]; warnings: Incident[]; reviews: PriorityReview[] };

export function calculatePriorityDeductions(input: { overdueCharges: OverdueCharge[]; warnings: Incident[]; redCards: Incident[]; now: Date }): PriorityDeduction[] {
  const result: PriorityDeduction[] = [];
  const overdue = input.overdueCharges.filter(row => !row.held && row.outstandingPence > 0 && row.dueDate.getTime() < input.now.getTime() - PRIORITY_OVERDUE_DAYS * DAY);
  if (overdue.length) {
    const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(overdue.reduce((n, row) => n + row.outstandingPence, 0) / 100);
    result.push({ id: "overdue", kind: "OVERDUE", points: PRIORITY_OVERDUE_POINTS, label: `${money} more than 14 days overdue`, recovery: "Clear the overdue balance to restore these points. Charges under SIXFL review are excluded.", expiresAt: null, fixtureId: null });
  }
  for (const [kind, incidents, cap] of [["SHIN_PAD", input.warnings, PRIORITY_SHIN_PAD_CAP], ["RED_CARD", input.redCards, PRIORITY_RED_CARD_CAP]] as const) {
    let remaining = cap;
    // Newest first means the capped portion stays with the most recent incidents.
    for (const row of [...incidents].sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id))) {
      const expiresAt = new Date(row.at.getTime() + PRIORITY_CONDUCT_DAYS * DAY);
      if (row.at > input.now || expiresAt <= input.now) continue;
      const points = Math.min(remaining, row.points);
      remaining -= points;
      result.push({ id: row.id, kind, points, label: row.label, recovery: points ? "Points return automatically after 28 days." : "Recorded; no extra deduction while this category is at its cap.", expiresAt, fixtureId: row.fixtureId });
    }
  }
  return result;
}

export async function getPriorityDeductionDetails(teamIds: string[], db: Db = prisma, now = new Date()): Promise<Map<string, PriorityDeductionDetails>> {
  const requested = [...new Set(teamIds.filter(Boolean))];
  if (!requested.length) return new Map();
  const identities = await Promise.all(requested.map(teamId => getRelatedTeamIdsForPaymentLedger(teamId, db)));
  const related = new Map(requested.map((id, index) => [id, identities[index]?.relatedTeamIds ?? [id]]));
  const allIds = [...new Set([...related.values()].flat())];
  const cutoff = new Date(now.getTime() - PRIORITY_CONDUCT_DAYS * DAY);
  const [charges, warnings, reviews] = await Promise.all([
    db.$queryRaw<Charge[]>(Prisma.sql`SELECT c.id,c."teamId",c."fixtureId",c.title,c."amountPence",c.status::text AS status,COALESCE(c."dueDate",f."kickoffAt",c."createdAt") AS "dueDate" FROM "PaymentCharge" c LEFT JOIN "Fixture" f ON f.id=c."fixtureId" WHERE c."teamId" IN (${Prisma.join(allIds)}) AND c.status::text <> 'VOID' AND COALESCE(c."dueDate",f."kickoffAt",c."createdAt") < ${new Date(now.getTime() - PRIORITY_OVERDUE_DAYS * DAY)}`),
    db.$queryRaw<Incident[]>(Prisma.sql`SELECT w.id,w."teamId",w."fixtureId",w."createdAt" AS at, 'Shin-pad warning · ' || h.name || ' v ' || a.name AS label, ${PRIORITY_SHIN_PAD_POINTS}::integer AS points FROM "TeamShinPadWarning" w JOIN "Fixture" f ON f.id=w."fixtureId" JOIN "Team" h ON h.id=f."homeTeamId" JOIN "Team" a ON a.id=f."awayTeamId" WHERE w."teamId" IN (${Prisma.join(allIds)}) AND w."createdAt" > ${cutoff} AND w."createdAt" <= ${now}`),
    db.$queryRaw<PriorityReview[]>(Prisma.sql`SELECT * FROM "SixflTvPriorityReview" WHERE "teamId" IN (${Prisma.join(allIds)}) ORDER BY "createdAt" DESC,id`),
  ]);
  const chargeIds = charges.map(row => row.id);
  const fixtureIds = [...new Set(charges.flatMap(row => row.fixtureId ? [row.fixtureId] : []))];
  const [transactions, fees, redCards] = await Promise.all([
    chargeIds.length ? db.$queryRaw<Array<{ chargeId: string; amountPence: number; notes: string | null }>>(Prisma.sql`SELECT "chargeId","amountPence",notes FROM "PaymentTransaction" WHERE "chargeId" IN (${Prisma.join(chargeIds)})`) : [],
    fixtureIds.length ? db.$queryRaw<Fee[]>(Prisma.sql`SELECT id,"teamId","fixtureId","amountPence",status::text AS status,note FROM "PlayerMatchFee" WHERE "teamId" IN (${Prisma.join(allIds)}) AND "fixtureId" IN (${Prisma.join(fixtureIds)}) AND status::text IN ('PAID','WAIVED')`) : [],
    db.$queryRaw<Incident[]>(Prisma.sql`SELECT review.id,review."teamId",f.id AS "fixtureId",f."kickoffAt" AS at, CASE WHEN review.points=20 THEN 'Confirmed serious sending-off' ELSE 'Confirmed sending-off' END AS label,review.points FROM "SixflTvPriorityReview" review JOIN "Fixture" f ON f.id=review."referenceId" AND review."teamId" IN (f."homeTeamId",f."awayTeamId") WHERE review.kind='RED_CARD' AND review."revokedAt" IS NULL AND review."teamId" IN (${Prisma.join(allIds)}) AND f."kickoffAt" > ${cutoff} AND f."kickoffAt" <= ${now}`),
  ]);
  const hydratedFees = await hydrateCaptainAssignedPlayerFees(fees, db);
  const activeReviews = reviews.filter(row => !row.revokedAt);
  const overdueCharges: OverdueCharge[] = allIds.flatMap(teamId => summariseChargesWithPlayerMatchFees(
    charges.filter(row => row.teamId === teamId).map(row => ({ ...row, transactions: transactions.filter(tx => tx.chargeId === row.id) })),
    hydratedFees.filter(row => row.teamId === teamId),
  ).filter(row => row.outstandingPence > 0).map(row => ({ id: row.charge.id, teamId, title: row.charge.title, dueDate: row.charge.dueDate, outstandingPence: row.outstandingPence, held: activeReviews.some(review => review.kind === "PAYMENT_HOLD" && review.teamId === teamId && review.referenceId === row.charge.id) })));
  return new Map(requested.map(teamId => {
    const ids = new Set(related.get(teamId));
    const teamWarnings = warnings.filter(row => ids.has(row.teamId));
    const teamCharges = overdueCharges.filter(row => ids.has(row.teamId));
    const deductions = calculatePriorityDeductions({ overdueCharges: teamCharges, warnings: teamWarnings.filter(row => !activeReviews.some(review => review.kind === "SHIN_PAD_DISMISSED" && review.teamId === row.teamId && review.referenceId === row.id)), redCards: redCards.filter(row => ids.has(row.teamId)), now });
    return [teamId, { deductions, deductionPoints: deductions.reduce((sum, row) => sum + row.points, 0), overdueCharges: teamCharges, warnings: teamWarnings, reviews: reviews.filter(row => ids.has(row.teamId)) }];
  }));
}
