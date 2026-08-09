import { NextRequest, NextResponse } from "next/server";

import { runPlayerDataHealthCleanup } from "@/lib/players/player-data-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization")?.trim() === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPlayerDataHealthCleanup({ source: "MONTHLY" });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Player data health job failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Player data health cleanup failed",
      },
      { status: 500 },
    );
  }
}
