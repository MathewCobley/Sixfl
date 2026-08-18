import { NextRequest, NextResponse } from "next/server";

import { reconcileLastMinuteReplacement } from "@/lib/fixtures/last-minute-replacement-resolution";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const access = await requireAdmin();

  const payload = (await request.json().catch(() => null)) as
    | { fixtureId?: string }
    | null;
  const fixtureId = payload?.fixtureId?.trim() ?? "";

  if (!fixtureId) {
    return NextResponse.json(
      { ok: false, error: "Fixture is required." },
      { status: 400 },
    );
  }

  try {
    const result = await reconcileLastMinuteReplacement({
      fixtureId,
      createdByUserId: access.user?.id ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "The replacement could not be reconciled.",
      },
      { status: 500 },
    );
  }
}
