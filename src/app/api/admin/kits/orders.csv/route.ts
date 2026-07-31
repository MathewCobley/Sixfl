// ========================================
// File: src/app/api/admin/kits/orders.csv/route.ts
// ========================================

import {
  getTeamKitSizeLabel,
  getTeamKitSockSizeLabel,
  getTeamKitStatusLabel,
} from "@/lib/kits/constants";
import { getTeamKitOrderExportRows } from "@/lib/kits/db";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

function csvValue(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function formatDate(value: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

export async function GET() {
  await requireAdmin();
  const rows = await getTeamKitOrderExportRows();

  const header = [
    "Team",
    "League",
    "Order status",
    "Kit code",
    "Kit name",
    "Kit position",
    "Back name",
    "Shirt number",
    "Kit size",
    "Sock size",
    "Submitted",
    "Admin notes",
  ];

  const csvRows = [
    header.map(csvValue).join(","),
    ...rows.map((row) =>
      [
        row.teamName,
        row.leagueName,
        getTeamKitStatusLabel(row.status),
        row.kitCode,
        row.kitName,
        row.position,
        row.backName,
        row.shirtNumber,
        getTeamKitSizeLabel(row.kitSize),
        getTeamKitSockSizeLabel(row.sockSize),
        formatDate(row.submittedAt),
        row.adminNotes,
      ]
        .map(csvValue)
        .join(","),
    ),
  ].join("\r\n");

  return new Response(`\uFEFF${csvRows}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sixfl-team-kit-orders-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
