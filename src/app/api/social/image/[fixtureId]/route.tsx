// ========================================
// File: src/app/api/social/image/[fixtureId]/route.tsx
// ========================================

import { SocialPostType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getScoreLabel(homeScore: number | null, awayScore: number | null) {
  if (homeScore === null || awayScore === null) {
    return null;
  }

  return `${homeScore} - ${awayScore}`;
}

function getPostTypeLabel(postType: SocialPostType, fixtureStatus: string) {
  if (postType === "RESULT") return "FULL TIME";
  if (postType === "FIXTURE") return "COMING UP";
  if (postType === "UPDATE") {
    if (fixtureStatus === "POSTPONED") return "POSTPONED";
    if (fixtureStatus === "CANCELLED") return "CANCELLED";
    return "UPDATE";
  }

  return "SIXFL";
}

function fitText(input: string, max = 26) {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}…`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ fixtureId: string }> },
) {
  const { fixtureId } = await context.params;

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      status: true,
      kickoffAt: true,
      socialPostType: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
      venue: {
        select: {
          name: true,
        },
      },
      homeTeam: {
        select: {
          name: true,
        },
      },
      awayTeam: {
        select: {
          name: true,
        },
      },
      result: {
        select: {
          homeScore: true,
          awayScore: true,
        },
      },
    },
  });

  if (!fixture || !fixture.homeTeam || !fixture.awayTeam || !fixture.league) {
    return new Response("Fixture not found", { status: 404 });
  }

  const postType = fixture.socialPostType ?? "NONE";
  const scoreLabel = getScoreLabel(
    fixture.result?.homeScore ?? null,
    fixture.result?.awayScore ?? null,
  );

  const kickoffLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(fixture.kickoffAt));

  const leagueLabel = fixture.league.season
    ? `${fixture.league.name} • ${fixture.league.season}`
    : fixture.league.name;

  const venueLabel = fixture.venue?.name ?? "SIXFL";
  const headerLabel = getPostTypeLabel(postType, fixture.status);

  const homeName = escapeXml(fitText(fixture.homeTeam.name, 24));
  const awayName = escapeXml(fitText(fixture.awayTeam.name, 24));
  const header = escapeXml(headerLabel);
  const league = escapeXml(fitText(leagueLabel, 56));
  const venue = escapeXml(fitText(venueLabel, 56));
  const kickoff = escapeXml(kickoffLabel);
  const score = escapeXml(scoreLabel ?? "VS");

  const showScore = postType === "RESULT" && scoreLabel;

  const footerLabel =
    postType === "FIXTURE"
      ? `${kickoffLabel} • ${venueLabel}`
      : venueLabel;

  const footer = escapeXml(fitText(footerLabel, 72));

  const svg = `
<svg width="1080" height="1080" viewBox="0 0 1080 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1080" y2="1080">
      <stop offset="0%" stop-color="#0F2C22" />
      <stop offset="55%" stop-color="#071018" />
      <stop offset="100%" stop-color="#04070B" />
    </linearGradient>
  </defs>

  <rect width="1080" height="1080" fill="url(#bg)" />
  <rect x="40" y="40" width="1000" height="1000" rx="40" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" />

  <text x="70" y="110" fill="#6EE7B7" font-size="28" font-family="Arial, sans-serif" font-weight="700" letter-spacing="6">${header}</text>
  <text x="930" y="110" fill="#FFFFFF" font-size="30" text-anchor="end" font-family="Arial, sans-serif" font-weight="800" letter-spacing="4">SIXFL</text>

  <text x="70" y="190" fill="rgba(255,255,255,0.8)" font-size="30" font-family="Arial, sans-serif" font-weight="600">${league}</text>

  <rect x="70" y="250" width="940" height="390" rx="34" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.10)" />

  <text x="120" y="390" fill="#FFFFFF" font-size="54" font-family="Arial, sans-serif" font-weight="800">${homeName}</text>
  <text x="960" y="390" fill="#FFFFFF" font-size="54" text-anchor="end" font-family="Arial, sans-serif" font-weight="800">${awayName}</text>

  <text x="540" y="${showScore ? "470" : "455"}" fill="#FFFFFF" font-size="${showScore ? "110" : "70"}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900">${score}</text>

  ${
    showScore
      ? ""
      : `<text x="540" y="545" fill="rgba(255,255,255,0.65)" font-size="26" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600">${kickoff}</text>`
  }

  <text x="70" y="930" fill="rgba(255,255,255,0.78)" font-size="26" font-family="Arial, sans-serif" font-weight="600">${footer}</text>
  <text x="70" y="970" fill="rgba(255,255,255,0.42)" font-size="20" font-family="Arial, sans-serif" font-weight="700" letter-spacing="3">6-A-SIDE FOOTBALL. DONE PROPERLY.</text>
  <text x="1000" y="970" fill="#6EE7B7" font-size="24" text-anchor="end" font-family="Arial, sans-serif" font-weight="800">#SIXFL</text>
</svg>`.trim();

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}