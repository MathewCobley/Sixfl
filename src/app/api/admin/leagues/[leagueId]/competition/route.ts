// ========================================
// File: src/app/api/admin/leagues/[leagueId]/competition/route.ts
// ========================================

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  createCompetitionForLeague,
  createNextLeagueSeason,
  getCompetitionSummaryForLeague,
} from "@/lib/league-competitions";
import { requireAdmin } from "@/lib/requireAdmin";

type RequestBody = {
  action?: unknown;
  seasonName?: unknown;
  copyTeams?: unknown;
};

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  await requireAdmin();

  const { leagueId } = await params;
  const summary = await getCompetitionSummaryForLeague(leagueId);

  return NextResponse.json(summary);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  await requireAdmin();

  const { leagueId } = await params;
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const action = getString(body?.action) ?? "ensureCompetition";

  try {
    if (action === "ensureCompetition") {
      await createCompetitionForLeague(leagueId);
      revalidatePath(`/admin/leagues/${leagueId}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "createSeason") {
      const seasonName = getString(body?.seasonName);
      if (!seasonName) {
        return NextResponse.json(
          { error: "Season name is required." },
          { status: 400 },
        );
      }

      const created = await createNextLeagueSeason({
        sourceLeagueId: leagueId,
        seasonName,
        copyTeams: body?.copyTeams !== false,
      });

      revalidatePath("/admin/leagues");
      revalidatePath(`/admin/leagues/${leagueId}`);
      revalidatePath(`/admin/leagues/${created.leagueId}`);
      revalidatePath("/leagues");
      revalidatePath(`/leagues/${created.slug}`);

      return NextResponse.json({ ok: true, ...created });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed." },
      { status: 500 },
    );
  }
}
