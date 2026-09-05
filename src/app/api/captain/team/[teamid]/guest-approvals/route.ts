import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireCaptain } from "@/lib/requireCaptain";
import { getFixtureGuestApprovals, searchGuestCandidates, setFixtureGuestApproval } from "@/lib/fixtures/guest-approvals";
import { assertGuestApprovalAccess, assertGuestApprovalOrigin, canManageGuestApprovals, GuestApprovalError, readGuestDecision } from "@/lib/fixtures/guest-approval-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ teamid: string }> };
const noStore = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  if (error instanceof GuestApprovalError) return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
  console.error("Fixture guest approval failed", error);
  return NextResponse.json({ error: "Guest approvals could not be saved or loaded. Please reload and try again." }, { status: 500, headers: noStore });
}

export async function GET(request: Request, { params }: Context) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  try {
    assertGuestApprovalAccess(access);
    const canManage = canManageGuestApprovals(access);
    const url = new URL(request.url);
    const fixtureId = url.searchParams.get("fixtureId") || "";
    if (!/^[a-zA-Z0-9_-]{1,150}$/.test(fixtureId)) throw new GuestApprovalError("Select a fixture first.");
    const data = await getFixtureGuestApprovals(teamid, fixtureId);
    const query = url.searchParams.get("q");
    if (query !== null && !canManage) throw new GuestApprovalError("Player search is available to SIXFL administrators only.", 403);
    const candidates = query !== null && canManage ? await searchGuestCandidates(teamid, query) : [];
    // Captains can see permission status, but not private notes, another player's email or administrator identity.
    const approvals = data.approvals.map((row) => canManage ? row : {
      id: row.id, playerUserId: row.playerUserId, playerName: row.playerName,
      status: row.status, revision: row.revision, approvedAt: row.approvedAt, revokedAt: row.revokedAt,
    });
    return NextResponse.json({ fixture: data.fixture, approvals, candidates, canManage }, { headers: noStore });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: Context) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  try {
    assertGuestApprovalAccess(access, true);
    assertGuestApprovalOrigin(request);
    const input = await readGuestDecision(request);
    const result = await setFixtureGuestApproval({ ...input, teamId: teamid, actorUserId: access.user!.id });
    revalidatePath(`/captain/team/${teamid}/match-fees`);
    return NextResponse.json({ ok: true, ...result }, { headers: noStore });
  } catch (error) { return failure(error); }
}
