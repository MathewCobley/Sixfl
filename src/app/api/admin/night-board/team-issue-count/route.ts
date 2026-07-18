// ========================================
// File: src/app/api/admin/night-board/team-issue-count/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await requireAdmin();

  const count = await prisma.fixtureCaptainConfirmation.count({
    where: { status: "ISSUE_RAISED" },
  });

  return NextResponse.json({ count });
}
