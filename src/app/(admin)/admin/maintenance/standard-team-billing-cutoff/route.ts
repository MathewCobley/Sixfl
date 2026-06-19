// ========================================
// File: src/app/(admin)/admin/maintenance/standard-team-billing-cutoff/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function applyStandardTeamBillingCutoff() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Team"
      ADD COLUMN IF NOT EXISTS "standardBillingStartsAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Team_standardBillingStartsAt_idx"
      ON "Team"("standardBillingStartsAt")
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "Team"
    SET "standardBillingStartsAt" = TIMESTAMP '2026-06-17 00:00:00.000'
    WHERE lower("name") IN ('dynamo kebab', 'crescent united')
  `);

  const cancelledRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH updated AS (
      UPDATE "PlayerMatchFee" pmf
      SET
        "status" = 'CANCELLED'::"PlayerMatchFeeStatus",
        "cancelledAt" = COALESCE(pmf."cancelledAt", NOW()),
        "paidAt" = NULL,
        "waivedAt" = NULL,
        "paymentUrl" = NULL,
        "paymentToken" = NULL,
        "note" = CASE
          WHEN pmf."note" IS NULL OR trim(pmf."note") = '' THEN 'Ignored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
          WHEN pmf."note" LIKE '%Ignored for standard-team billing:%' THEN pmf."note"
          ELSE pmf."note" || E'\nIgnored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
        END,
        "updatedAt" = NOW()
      FROM "Fixture" f, "Team" t
      WHERE pmf."fixtureId" = f."id"
        AND t."id" = pmf."teamId"
        AND t."standardBillingStartsAt" IS NOT NULL
        AND f."kickoffAt" < t."standardBillingStartsAt"
        AND pmf."status" <> 'CANCELLED'::"PlayerMatchFeeStatus"
      RETURNING pmf."id"
    )
    SELECT COUNT(*)::bigint AS count FROM updated
  `;

  const voidedRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH updated AS (
      UPDATE "PaymentCharge" pc
      SET
        "status" = 'VOID'::"PaymentChargeStatus",
        "paymentToken" = NULL,
        "lastStripeCheckoutUrl" = NULL,
        "lastStripeCheckoutSessionId" = NULL,
        "lastStripeCheckoutCreatedAt" = NULL,
        "lastStripeCheckoutAmountPence" = NULL,
        "description" = CASE
          WHEN pc."description" IS NULL OR trim(pc."description") = '' THEN 'Ignored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
          WHEN pc."description" LIKE '%Ignored for standard-team billing:%' THEN pc."description"
          ELSE pc."description" || E'\nIgnored for standard-team billing: fixture was before the team became a standard team on 17 June 2026.'
        END,
        "updatedAt" = NOW()
      FROM "Fixture" f, "Team" t
      WHERE pc."fixtureId" = f."id"
        AND t."id" = pc."teamId"
        AND t."standardBillingStartsAt" IS NOT NULL
        AND f."kickoffAt" < t."standardBillingStartsAt"
        AND pc."status" <> 'VOID'::"PaymentChargeStatus"
      RETURNING pc."id"
    )
    SELECT COUNT(*)::bigint AS count FROM updated
  `;

  return {
    cancelledPlayerFees: Number(cancelledRows[0]?.count ?? 0),
    voidedTeamCharges: Number(voidedRows[0]?.count ?? 0),
  };
}

export async function GET() {
  await requireAdmin();

  try {
    const result = await applyStandardTeamBillingCutoff();

    return NextResponse.json({
      ok: true,
      message: "Standard-team billing cutoff applied for Dynamo Kebab and Crescent United from 17 June 2026.",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown maintenance error",
      },
      { status: 500 },
    );
  }
}
