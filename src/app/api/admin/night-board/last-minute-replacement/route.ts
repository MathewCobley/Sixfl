import { NextRequest, NextResponse } from "next/server";

import { sendLastMinuteReplacementAlert } from "@/lib/fixtures/last-minute-replacement";
import { getLastMinuteReplacementControlState } from "@/lib/fixtures/last-minute-replacement-resolution";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requireAdmin();

  const fixtureId = request.nextUrl.searchParams.get("fixtureId")?.trim() ?? "";
  const currentTeamId = request.nextUrl.searchParams.get("currentTeamId")?.trim() ?? "";

  if (!fixtureId || !currentTeamId) {
    return NextResponse.json(
      { ok: false, error: "Fixture and team are required." },
      { status: 400 },
    );
  }

  try {
    const state = await getLastMinuteReplacementControlState({
      fixtureId,
      currentTeamId,
    });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "The replacement status could not be loaded.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdmin();

  try {
    const payload = (await request.json().catch(() => null)) as
      | { fixtureId?: string; droppedTeamId?: string }
      | null;
    const fixtureId = payload?.fixtureId?.trim() ?? "";
    const droppedTeamId = payload?.droppedTeamId?.trim() ?? "";

    if (!fixtureId || !droppedTeamId) {
      return NextResponse.json(
        { ok: false, error: "Fixture and dropped team are required." },
        { status: 400 },
      );
    }

    const result = await sendLastMinuteReplacementAlert({
      fixtureId,
      droppedTeamId,
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
            : "The last-minute replacement alert could not be sent.",
      },
      { status: 500 },
    );
  }
}
