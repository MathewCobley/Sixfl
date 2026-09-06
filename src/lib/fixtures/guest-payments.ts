import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lockTemporaryFixtureFee } from "@/lib/payments/temporary-fee-lock";
import { GuestApprovalError } from "./guest-approval-policy";
import { guestFixtureAcceptsPayment, type GuestPaymentInput } from "./guest-payment-policy";

type Tx = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
type Db = Pick<Tx, "$queryRaw"> & { $transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> };
export type GuestPaymentContext = {
  teamId: string; fixtureId: string; approvalId: string;
};
type ApprovalContext = {
  id: string; playerUserId: string; approvalStatus: string; revision: number;
  email: string | null; playerName: string | null; kickoffAt: Date; fixtureStatus: string;
};
export type GuestFee = {
  id: string; amountPence: number; status: string; paymentUrl: string | null;
  temporaryUserId: string | null; paidAt: Date | null;
};

async function approvalContext(input: GuestPaymentContext, db: Pick<Tx, "$queryRaw">) {
  const rows = await db.$queryRaw<ApprovalContext[]>(Prisma.sql`
    SELECT a."id", a."playerUserId", a."status" AS "approvalStatus", a."revision",
      u."email", u."name" AS "playerName", f."kickoffAt", f."status"::text AS "fixtureStatus"
    FROM "FixtureGuestApproval" a
    JOIN "Fixture" f ON f."id" = a."fixtureId"
    JOIN "User" u ON u."id" = a."playerUserId"
    WHERE a."id" = ${input.approvalId} AND a."fixtureId" = ${input.fixtureId}
      AND a."teamId" = ${input.teamId} AND f."publishedAt" IS NOT NULL
      AND (f."homeTeamId" = ${input.teamId} OR f."awayTeamId" = ${input.teamId})
  `);
  if (!rows[0]) throw new GuestApprovalError("This guest approval does not belong to the selected team and fixture.", 404);
  return rows[0];
}

async function matchingFees(input: GuestPaymentContext, approval: ApprovalContext, db: Pick<Tx, "$queryRaw">) {
  // Also detect an ordinary member/prospect fee, but never relink an ambiguous identity.
  return db.$queryRaw<GuestFee[]>(Prisma.sql`
    SELECT fee."id", fee."amountPence", fee."status"::text, fee."paymentUrl", fee."temporaryUserId", fee."paidAt"
    FROM "PlayerMatchFee" fee
    LEFT JOIN "TeamMember" m ON m."id" = fee."teamMemberId"
    LEFT JOIN "TeamPlayerProspect" p ON p."id" = fee."prospectId"
    WHERE fee."fixtureId" = ${input.fixtureId} AND fee."teamId" = ${input.teamId}
      AND (fee."temporaryUserId" = ${approval.playerUserId} OR m."userId" = ${approval.playerUserId}
        OR (${approval.email}::text IS NOT NULL AND NULLIF(TRIM(p."email"), '') IS NOT NULL
            AND LOWER(TRIM(p."email")) = LOWER(TRIM(${approval.email}::text))))
    ORDER BY fee."createdAt", fee."id"
  `);
}

export async function getGuestPaymentState(input: GuestPaymentContext, db: Db = prisma) {
  const approval = await approvalContext(input, db);
  const fees = await matchingFees(input, approval, db);
  const active = fees.filter((fee) => fee.status !== "CANCELLED");
  const fee = active[0] ?? fees[0] ?? null;
  const conflict = active.length > 1 || Boolean(fee && fee.temporaryUserId !== approval.playerUserId);
  return {
    approvalStatus: approval.approvalStatus, revision: approval.revision,
    kickoffAt: approval.kickoffAt.toISOString(),
    editable: approval.approvalStatus === "APPROVED" && guestFixtureAcceptsPayment(approval.fixtureStatus, approval.kickoffAt),
    hasEmail: Boolean(approval.email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(approval.email.trim())),
    conflict,
    fee: fee ? {
      id: fee.id, amountPence: fee.amountPence, status: fee.status,
      paymentUrl: approval.approvalStatus === "APPROVED" && !conflict && fee.status === "OPEN" ? fee.paymentUrl : null,
    } : null,
  };
}

/** Creating a fee is explicit captain acceptance, not a permanent registration or appearance. */
export async function prepareGuestPayment(
  input: GuestPaymentContext & GuestPaymentInput & { actorUserId: string },
  paymentUrlForToken: (token: string) => string,
  db: Db = prisma,
) {
  if (input.action === "create" && (!Number.isInteger(input.amountPence) || input.amountPence! < 0 || input.amountPence! > 10000)) {
    throw new GuestApprovalError("Choose a guest fee between £0 and £100.");
  }
  return db.$transaction(async (tx) => {
    const actors = await tx.$queryRaw<Array<{ role: string; name: string | null }>>(Prisma.sql`
      SELECT "role"::text, "name" FROM "User" WHERE "id" = ${input.actorUserId} FOR SHARE
    `);
    const actor = actors[0];
    const captains = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT m."id" FROM "TeamMember" m JOIN "Team" t ON t."id" = m."teamId"
      WHERE m."userId" = ${input.actorUserId} AND m."teamId" = ${input.teamId}
        AND m."role"::text = 'CAPTAIN' AND t."teamMode"::text <> 'MANAGED' FOR SHARE OF m
    `);
    if (!actor || (actor.role !== "ADMIN" && !captains[0])) {
      throw new GuestApprovalError("Only this team's captain or SIXFL admin can set guest payments.", 403);
    }
    // Same fixture lock as approval/revocation; NO KEY UPDATE permits existing fee FK inserts.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Fixture" WHERE "id" = ${input.fixtureId} FOR NO KEY UPDATE`);
    const approval = await approvalContext(input, tx);
    if (approval.approvalStatus !== "APPROVED") throw new GuestApprovalError("SIXFL approval is required before creating or sending a guest fee.", 409);
    if (approval.revision !== input.expectedRevision || approval.kickoffAt.getTime() !== Date.parse(input.expectedKickoffAt)) {
      throw new GuestApprovalError("The approval or fixture has changed. Reload and check it before sending.", 409);
    }
    if (!guestFixtureAcceptsPayment(approval.fixtureStatus, approval.kickoffAt)) {
      throw new GuestApprovalError("Guest payments can be set for upcoming scheduled fixtures or completed matches from the last 30 days.", 409);
    }
    await lockTemporaryFixtureFee(tx, { fixtureId: input.fixtureId, teamId: input.teamId, userId: approval.playerUserId });
    const fees = await matchingFees(input, approval, tx);
    const active = fees.filter((fee) => fee.status !== "CANCELLED");
    const existing = active[0] ?? fees[0];
    if (active.length > 1 || (existing && existing.temporaryUserId !== approval.playerUserId)) {
      throw new GuestApprovalError("A squad/prospect fee or duplicate fee already exists for this player. Ask SIXFL to reconcile it; no new charge has been created.", 409);
    }
    if (existing) {
      // Lock and re-read: a concurrent payment must never be reset or changed.
      const rows = await tx.$queryRaw<GuestFee[]>(Prisma.sql`
        SELECT "id", "amountPence", "status"::text, "paymentUrl", "temporaryUserId", "paidAt"
        FROM "PlayerMatchFee" WHERE "id" = ${existing.id} FOR UPDATE
      `);
      const current = rows[0];
      if (current.status === "CANCELLED") throw new GuestApprovalError("This fee was cancelled. Ask SIXFL to review it rather than creating another charge.", 409);
      if (input.action === "send" && input.feeId !== current.id) throw new GuestApprovalError("The fee has changed. Reload the guest row.", 409);
      if (input.action === "create" && current.amountPence !== input.amountPence) {
        throw new GuestApprovalError("This player already has a fee for this match. The existing amount has been preserved; reload to view it.", 409);
      }
      if (current.status === "OPEN" && !approval.email?.trim()) throw new GuestApprovalError("Add a real email address to this player's existing account before sending a payment link.");
      return { feeId: current.id, status: current.status, amountPence: current.amountPence, created: false };
    }
    if (input.action !== "create") throw new GuestApprovalError("Create this guest's fee first.", 404);
    const members = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "TeamMember" WHERE "teamId" = ${input.teamId} AND "userId" = ${approval.playerUserId} LIMIT 1
    `);
    if (members[0]) throw new GuestApprovalError("This player has joined the permanent squad. Use their normal squad payment row.", 409);
    const amountPence = input.amountPence!;
    if (amountPence > 0 && (!approval.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(approval.email.trim()))) {
      throw new GuestApprovalError("Add a real email address to this player's existing account before creating their payment link.");
    }
    const id = `tmpg_${randomUUID().replaceAll("-", "")}`;
    const token = amountPence > 0 ? randomBytes(24).toString("hex") : null;
    const paymentUrl = token ? paymentUrlForToken(token) : null;
    const status = amountPence === 0 ? "WAIVED" : "OPEN";
    const now = new Date();
    const actorName = actor.name?.trim() || "SIXFL team organiser";
    const note = `SIXFL-approved guest accepted for this fixture by ${actorName}. Team-set guest fee: £${(amountPence / 100).toFixed(2)}. Approval ${approval.id}. Permanent registration unchanged.`;
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "PlayerMatchFee" ("id", "fixtureId", "teamId", "temporaryUserId", "amountPence", "status",
        "waivedAt", "paymentToken", "paymentUrl", "note", "createdAt", "updatedAt")
      VALUES (${id}, ${input.fixtureId}, ${input.teamId}, ${approval.playerUserId}, ${amountPence}, ${status}::"PlayerMatchFeeStatus",
        ${amountPence === 0 ? now : null}, ${token}, ${paymentUrl}, ${note}, ${now}, ${now})
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "FixtureGuestPaymentAudit" ("id", "approvalId", "playerMatchFeeId", "approvalRevision", "amountPence", "createdByUserId", "createdByName")
      VALUES (${randomUUID()}, ${approval.id}, ${id}, ${approval.revision}, ${amountPence}, ${input.actorUserId}, ${actorName})
    `);
    return { feeId: id, status, amountPence, created: true };
  });
}
