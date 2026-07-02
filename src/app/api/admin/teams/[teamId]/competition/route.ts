// ========================================
// File: src/app/api/admin/teams/[teamId]/competition/route.ts
// ========================================

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  getCompetitionOptions,
  getTeamCompetitionData,
  updateTeamCompetition,
} from "@/lib/league-season-teams";
import { requireAdmin } from "@/lib/requireAdmin";

type RequestBody = {
  competitionId?: unknown;
};

function getString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  await requireAdmin();

  const { teamId } = await params;
  const [team, competitions] = await Promise.all([
    getTeamCompetitionData(teamId),
    getCompetitionOptions(),
  ]);

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  return NextResponse.json({ team, competitions });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  await requireAdmin();

  const { teamId } = await params;
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const competitionId = getString(body?.competitionId);

  try {
    await updateTeamCompetition({ teamId, competitionId });
    const team = await getTeamCompetitionData(teamId);

    revalidatePath("/admin/teams");
    revalidatePath(`/admin/teams/${teamId}`);
    if (team?.currentLeagueId) {
      revalidatePath(`/admin/leagues/${team.currentLeagueId}`);
    }

    return NextResponse.json({ ok: true, team });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Competition could not be saved." },
      { status: 500 },
    );
  }
}
