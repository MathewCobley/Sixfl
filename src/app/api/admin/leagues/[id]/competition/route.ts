// ========================================
// File: src/app/api/admin/leagues/[id]/competition/route.ts
// ========================================

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  createCompetitionForLeague,
  createNextLeagueSeason,
  getCompetitionSummaryForLeague,
} from "@/lib/league-competitions";
import { makeLeagueSeasonCurrent, SeasonActivationError } from "@/lib/leagues/season-activation";
import { requireAdmin } from "@/lib/requireAdmin";

type RequestBody = {
  action?: unknown;
  seasonName?: unknown;
  copyTeams?: unknown;
  confirmed?: unknown;
  expectedCurrentLeagueId?: unknown;
};

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;
  const summary = await getCompetitionSummaryForLeague(id);

  return NextResponse.json(summary);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const action = getString(body?.action) ?? "ensureCompetition";

  try {
    if (action === "ensureCompetition") {
      await createCompetitionForLeague(id);
      revalidatePath(`/admin/leagues/${id}`);
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
        sourceLeagueId: id,
        seasonName,
        copyTeams: body?.copyTeams !== false,
      });

      revalidatePath("/admin/leagues");
      revalidatePath(`/admin/leagues/${id}`);
      revalidatePath(`/admin/leagues/${created.leagueId}`);
      revalidatePath("/leagues");
      revalidatePath(`/leagues/${created.slug}`);

      return NextResponse.json({ ok: true, ...created });
    }

    if (action === "makeCurrent") {
      if (
        body?.confirmed !== true ||
        !(body.expectedCurrentLeagueId === null ||
          (typeof body.expectedCurrentLeagueId === "string" && body.expectedCurrentLeagueId.trim()))
      ) {
        return NextResponse.json({ error: "Refresh the season panel and confirm which current season to replace." }, { status: 400 });
      }
      const switched = await makeLeagueSeasonCurrent({
        leagueId: id,
        expectedCurrentLeagueId: getString(body.expectedCurrentLeagueId),
        confirmed: true,
      });
      revalidatePath("/");
      revalidatePath("/leagues", "layout");
      revalidatePath("/admin/leagues", "layout");
      revalidatePath("/admin/teams");
      revalidatePath(`/leagues/${switched.slug}`, "layout");
      if (switched.previousSlug) revalidatePath(`/leagues/${switched.previousSlug}`, "layout");
      for (const teamId of switched.teamIds) {
        revalidatePath(`/admin/teams/${teamId}`, "layout");
        revalidatePath(`/captain/team/${teamId}`, "layout");
        revalidatePath(`/player/team/${teamId}`, "layout");
      }
      return NextResponse.json({ ok: true, leagueId: switched.leagueId });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed." },
      { status: error instanceof SeasonActivationError ? error.status : 500 },
    );
  }
}
