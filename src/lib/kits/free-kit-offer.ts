import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// The existing expiry fields are an explicit team-level override. Keep the
// original Team/InterestLead opt-in flags as evidence, rather than rewriting
// somebody's original registration when an administrator turns the offer off.
export type TeamFreeKitOffer = {
  teamId: string;
  teamName: string;
  revision: string;
  wantsFreeKit: boolean;
  leadWantsFreeKit: boolean;
  expiredAt: Date | null;
  reason: string | null;
  leagueEnabled: boolean;
  legacyOffer: boolean;
  hasExistingOrder: boolean;
  hasRetainedOrder: boolean;
  hasKitCharges: boolean;
  enabled: boolean;
  includedEligible: boolean;
};

type OfferRow = Omit<TeamFreeKitOffer, "enabled" | "includedEligible">;
type OfferReader = Pick<Prisma.TransactionClient, "$queryRaw">;
const CHANGEOVER = new Date("2026-08-01T10:33:15.000Z");
const EXTRA_KIT_PREFIX = "Additional kit contribution •";

export class FreeKitOfferError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) {
    super(message);
    this.name = "FreeKitOfferError";
  }
}

export async function getTeamFreeKitOffer(
  teamId: string,
  db: OfferReader = prisma,
  lock = false,
): Promise<TeamFreeKitOffer | null> {
  const rows = await db.$queryRaw<OfferRow[]>(Prisma.sql`
    SELECT
      team."id" AS "teamId", team."name" AS "teamName",
      team.xmin::text AS "revision",
      COALESCE(team."wantsFreeKit", FALSE) AS "wantsFreeKit",
      EXISTS (
        SELECT 1 FROM "InterestLead" lead
        WHERE lead."convertedTeamId" = team."id" AND lead."wantsFreeKit" = TRUE
      ) AS "leadWantsFreeKit",
      team."freeKitOfferExpiredAt" AS "expiredAt",
      team."freeKitOfferExpiryReason" AS "reason",
      COALESCE(league."freeKitOfferEnabled", TRUE) AS "leagueEnabled",
      (
        (team."wantsFreeKit" = TRUE AND team."createdAt" < ${CHANGEOVER}) OR
        EXISTS (SELECT 1 FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = team."id" AND lead."wantsFreeKit" = TRUE
            AND lead."createdAt" < ${CHANGEOVER})
      ) AS "legacyOffer",
      EXISTS (
        SELECT 1 FROM "TeamKitOrder" kit_order
        WHERE kit_order."teamId" = team."id" AND kit_order."status"::text <> 'CANCELLED'
      ) AS "hasExistingOrder",
      EXISTS (
        SELECT 1 FROM "TeamKitOrder" kit_order
        WHERE kit_order."teamId" = team."id" AND kit_order."status"::text <> 'CANCELLED'
          AND kit_order."createdAt" < team."freeKitOfferExpiredAt"
      ) AS "hasRetainedOrder",
      EXISTS (
        SELECT 1 FROM "PaymentCharge" charge
        WHERE charge."teamId" = team."id" AND charge."title" LIKE ${`${EXTRA_KIT_PREFIX}%`}
          AND (charge."status"::text <> 'VOID' OR EXISTS (
            SELECT 1 FROM "PaymentTransaction" receipt WHERE receipt."chargeId" = charge."id"
          ))
      ) AS "hasKitCharges"
    FROM "Team" team
    LEFT JOIN "League" league ON league."id" = team."leagueId"
    WHERE team."id" = ${teamId}
    ${lock ? Prisma.sql`FOR UPDATE OF team` : Prisma.empty}
  `);
  const row = rows[0];
  if (!row) return null;
  const requested = row.wantsFreeKit || row.leadWantsFreeKit;
  return {
    ...row,
    enabled: Boolean(requested && !row.expiredAt),
    // Historic orders keep their prior allocation. A NEW paid order created
    // after the switch was turned off must never reactivate seven free kits.
    includedEligible: Boolean(requested && (!row.expiredAt || row.hasRetainedOrder)),
  };
}

export async function setTeamFreeKitOffer(input: {
  teamId: string;
  enabled: boolean;
  actorUserId: string;
  reason: string;
  expectedRevision: string;
}) {
  if (!input.teamId || typeof input.enabled !== "boolean" || !input.actorUserId) {
    throw new FreeKitOfferError("invalid_request", "Choose a team and a valid offer setting.", 400);
  }
  if (!input.expectedRevision) {
    throw new FreeKitOfferError("stale_offer", "Reload Team settings before changing this offer.");
  }
  const reason = input.reason.trim();
  if (reason.length > 500 || (!input.enabled && !reason)) {
    throw new FreeKitOfferError("reason_required", "Give a short reason for turning the offer off (up to 500 characters).", 400);
  }
  return prisma.$transaction(async (tx) => {
    const current = await getTeamFreeKitOffer(input.teamId, tx, true);
    if (!current) throw new FreeKitOfferError("missing_team", "Team not found.", 404);
    // A repeated successful request is a no-op, including when its old revision
    // was retained by the browser after an interrupted response.
    if (input.enabled === current.enabled && (input.enabled || current.expiredAt)) {
      return { changed: false, state: current };
    }
    if (current.revision !== input.expectedRevision) {
      throw new FreeKitOfferError("stale_offer", "The team has changed. Reload Team settings before trying again.");
    }
    if (current.hasExistingOrder || current.hasKitCharges) {
      throw new FreeKitOfferError("offer_in_use", "A kit order or kit payment already exists. Review it in Admin Kits before changing the offer; existing orders and payments have not been changed.");
    }
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Team" SET
        "wantsFreeKit" = CASE WHEN ${input.enabled} AND NOT ${current.leadWantsFreeKit}
          THEN TRUE ELSE "wantsFreeKit" END,
        "freeKitOfferExpiredAt" = CASE WHEN ${input.enabled} THEN NULL ELSE clock_timestamp() END,
        "freeKitOfferExpiryReason" = ${input.enabled ? null : reason},
        "updatedAt" = clock_timestamp()
      WHERE "id" = ${input.teamId}
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "TeamFreeKitOfferAudit" (
        "id", "teamId", "previousValue", "newValue", "actorUserId", "reason", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${input.teamId}, ${current.enabled}, ${input.enabled},
        ${input.actorUserId}, ${reason || null}, clock_timestamp()
      )
    `);
    const state = await getTeamFreeKitOffer(input.teamId, tx);
    if (!state) throw new FreeKitOfferError("missing_team", "Team not found.", 404);
    return { changed: true, state };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
}
