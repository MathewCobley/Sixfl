// ========================================
// File: src/app/api/admin/player-prospects/chase-status/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

type ChaseDispatchRow = {
  prospectId: string;
  sourceType: string;
  status: string;
  at: Date | null;
};

function getProspectIds(request: Request) {
  const url = new URL(request.url);
  const fromRepeatedParams = url.searchParams.getAll("id");
  const fromCsv = url.searchParams
    .get("ids")
    ?.split(",")
    .map((value) => value.trim()) ?? [];

  return Array.from(new Set([...fromRepeatedParams, ...fromCsv].map((value) => value.trim()).filter(Boolean))).slice(0, 100);
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

export async function GET(request: Request) {
  await requireAdmin();

  const prospectIds = getProspectIds(request);

  if (prospectIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const rows = await prisma.$queryRaw<ChaseDispatchRow[]>(Prisma.sql`
    SELECT DISTINCT ON (d."sourceId", d."sourceType")
      d."sourceId" AS "prospectId",
      d."sourceType" AS "sourceType",
      d."status"::text AS "status",
      COALESCE(d."sentAt", d."failedAt", d."processedAt", d."createdAt") AS "at"
    FROM "NotificationDispatch" d
    WHERE d."sourceId" IN (${Prisma.join(prospectIds)})
      AND d."channel" = 'EMAIL'
      AND d."sourceType" IN ('MANAGED_SQUAD_JOIN_CHASE', 'MANAGED_SQUAD_JOIN_FINAL_CHASE')
    ORDER BY d."sourceId", d."sourceType", COALESCE(d."sentAt", d."failedAt", d."processedAt", d."createdAt") DESC
  `);

  const byProspectId = new Map<
    string,
    {
      prospectId: string;
      chaseStatus: string | null;
      chaseAt: string | null;
      finalChaseStatus: string | null;
      finalChaseAt: string | null;
    }
  >();

  for (const id of prospectIds) {
    byProspectId.set(id, {
      prospectId: id,
      chaseStatus: null,
      chaseAt: null,
      finalChaseStatus: null,
      finalChaseAt: null,
    });
  }

  for (const row of rows) {
    const item = byProspectId.get(row.prospectId);
    if (!item) continue;

    if (row.sourceType === "MANAGED_SQUAD_JOIN_FINAL_CHASE") {
      item.finalChaseStatus = row.status;
      item.finalChaseAt = toIso(row.at);
    } else {
      item.chaseStatus = row.status;
      item.chaseAt = toIso(row.at);
    }
  }

  return NextResponse.json({ items: Array.from(byProspectId.values()) });
}
