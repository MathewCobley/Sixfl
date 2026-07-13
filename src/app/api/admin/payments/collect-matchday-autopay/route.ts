// ========================================
// File: src/app/api/admin/payments/collect-matchday-autopay/route.ts
// ========================================

import { NextResponse } from "next/server";

import { chargeDueMatchdayAutoPayments } from "@/lib/payments/team-autopay";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function POST() {
  await requireAdmin();

  const results = await chargeDueMatchdayAutoPayments();

  return NextResponse.json({
    ok: true,
    total: results.length,
    paid: results.filter((item) => item.status === "paid").length,
    failed: results.filter((item) => item.status === "failed" || item.status === "requires_action").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    results,
  });
}
