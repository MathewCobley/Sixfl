import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GoalAwardError, getMonthlyPageData, nominateMonthlyGoal, voteMonthlyGoal } from "@/lib/goal-of-month/community";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "no-store, max-age=0" };

async function viewer() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  const user = await prisma.user.findUnique({
    where: { email }, select: { id: true, role: true, emailVerified: true, _count: { select: { teamMembers: true } } },
  });
  if (!user) return null;
  const captainCount = await prisma.team.count({ where: { captainUserId: user.id } });
  return { id: user.id, eligible: user.role === "ADMIN" || Boolean(user.emailVerified && (user._count.teamMembers > 0 || captainCount > 0)) };
}

export async function GET() {
  try {
    const user = await viewer();
    return NextResponse.json({ ...await getMonthlyPageData(user?.id ?? null), viewer: { signedIn: Boolean(user), eligible: Boolean(user?.eligible) } }, { headers });
  } catch (error) {
    console.error("Could not load Goal of the Month", error);
    return NextResponse.json({ error: "Goal of the Month is temporarily unavailable. Please try again." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).host !== host))
      return NextResponse.json({ error: "Please submit from the SIXFL website." }, { status: 403, headers });
    const user = await viewer();
    if (!user?.eligible) return NextResponse.json({ error: "Sign in with a verified SIXFL player or captain account to take part." }, { status: 403, headers });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
    const id = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : null;
    if (body.action === "nominate") {
      const fixtureId = id(body.fixtureId), scoringTeamId = id(body.scoringTeamId);
      const goalNumber = Number(body.goalNumber);
      if (!fixtureId || !scoringTeamId || !Number.isInteger(goalNumber) || goalNumber < 1)
        return NextResponse.json({ error: "Choose the fixture, goal number and scoring team." }, { status: 400, headers });
      const scorerName = typeof body.scorerName === "string" ? body.scorerName.trim().slice(0, 100) || null : null;
      const result = await nominateMonthlyGoal({ userId: user.id, fixtureId, scoringTeamId, goalNumber, scorerName });
      return NextResponse.json({ ok: true, ...result }, { headers });
    }
    if (body.action === "vote") {
      const candidateId = id(body.candidateId);
      if (!candidateId) return NextResponse.json({ error: "Choose a finalist." }, { status: 400, headers });
      return NextResponse.json({ ok: true, ...await voteMonthlyGoal(user.id, candidateId) }, { headers });
    }
    return NextResponse.json({ error: "Unknown award action." }, { status: 400, headers });
  } catch (error) {
    if (error instanceof GoalAwardError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("Could not save monthly goal action", error);
    return NextResponse.json({ error: "Could not save. Please reload to check your selection before trying again." }, { status: 500, headers });
  }
}
