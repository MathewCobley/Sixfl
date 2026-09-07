import { NextResponse } from "next/server";
import { GET as legacyGet, POST as legacyPost } from "@/lib/goal-of-week/legacy-api";
import { getAwardTransition } from "@/lib/goal-of-month/community";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "no-store, max-age=0" };

// Keep old links and the current weekly round working, but never open another
// weekly round after the fixed deployment transition dates.
export async function GET() {
  try {
    const transition = await getAwardTransition();
    const response = await legacyGet();
    if (!response.ok) return response;
    const payload = await response.json();
    const now = new Date();
    if (now >= transition.weeklyNominationsCloseAt) payload.nomination.fixtures = [];
    if (now >= transition.weeklyVotingClosesAt) {
      payload.voting.open = false;
      payload.voting.windowOpen = false;
    }
    return NextResponse.json({ ...payload, monthlyUrl: "/goal-of-the-month", legacyRound: true }, { headers });
  } catch (error) {
    console.error("Could not load final weekly award round", error);
    return NextResponse.json({ error: "The weekly archive is temporarily unavailable." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const transition = await getAwardTransition();
    const payload = await request.clone().json().catch(() => null);
    const now = new Date();
    if ((payload?.action === "nominate" && now >= transition.weeklyNominationsCloseAt)
      || (payload?.action === "vote" && now >= transition.weeklyVotingClosesAt)) {
      return NextResponse.json({ error: "The final weekly round has closed. Please use Goal of the Month.", monthlyUrl: "/goal-of-the-month" }, { status: 409, headers });
    }
    return legacyPost(request);
  } catch (error) {
    console.error("Could not check final weekly award deadline", error);
    return NextResponse.json({ error: "Could not check the award deadline. Nothing was changed." }, { status: 503, headers });
  }
}
