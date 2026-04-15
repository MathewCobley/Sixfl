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

function truncate(input: string, max = 28) {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}…`;
}

function formatKickoffLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(date);
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
  const showScore = postType === "RESULT" && scoreLabel !== null;

  const headerLabel = getPostTypeLabel(postType, fixture.status);
  const kickoffLabel = formatKickoffLabel(new Date(fixture.kickoffAt));

  const leagueLabel = fixture.league.season
    ? `${fixture.league.name} • ${fixture.league.season}`
    : fixture.league.name;

  const venueLabel = fixture.venue?.name ?? "SIXFL";

  const homeTeamName = escapeXml(truncate(fixture.homeTeam.name, 24));
  const awayTeamName = escapeXml(truncate(fixture.awayTeam.name, 24));
  const safeLeagueLabel = escapeXml(truncate(leagueLabel, 54));
  const safeVenueLabel = escapeXml(truncate(venueLabel, 42));
  const safeKickoffLabel = escapeXml(kickoffLabel);
  const safeHeaderLabel = escapeXml(headerLabel);
  const safeScoreLabel = escapeXml(scoreLabel ?? "VS");

  const footerLabel =
    postType === "FIXTURE"
      ? `${kickoffLabel} • ${venueLabel}`
      : venueLabel;

  const safeFooterLabel = escapeXml(truncate(footerLabel, 64));

  const svg = `
<svg width="1080" height="1080" viewBox="0 0 1080 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1080" y2="1080">
      <stop offset="0%" stop-color="#0F3A2D" />
      <stop offset="42%" stop-color="#0A1A14" />
      <stop offset="100%" stop-color="#05080D" />
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(540 120) rotate(90) scale(420 860)">
      <stop offset="0%" stop-color="rgba(30,90,67,0.55)" />
      <stop offset="100%" stop-color="rgba(30,90,67,0)" />
    </radialGradient>
  </defs>

  <rect width="1080" height="1080" fill="url(#bg)" />
  <rect width="1080" height="1080" fill="url(#glow)" />

  <rect x="34" y="34" width="1012" height="1012" rx="34" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" />

  <text x="72" y="114" fill="#6EE7B7" font-size="30" font-family="Arial, sans-serif" font-weight="800" letter-spacing="8">${safeHeaderLabel}</text>
  <text x="955" y="114" fill="#FFFFFF" font-size="32" text-anchor="end" font-family="Arial, sans-serif" font-weight="900" letter-spacing="6">SIXFL</text>

  <text x="72" y="190" fill="rgba(255,255,255,0.82)" font-size="28" font-family="Arial, sans-serif" font-weight="700">${safeLeagueLabel}</text>

  <rect x="72" y="248" width="936" height="438" rx="30" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.10)" />

  <text x="150" y="388" fill="#FFFFFF" font-size="56" font-family="Arial, sans-serif" font-weight="900">${homeTeamName}</text>
  <text x="930" y="388" fill="#FFFFFF" font-size="56" text-anchor="end" font-family="Arial, sans-serif" font-weight="900">${awayTeamName}</text>

  <line x1="222" y1="432" x2="858" y2="432" stroke="rgba(255,255,255,0.06)" />

  <text x="540" y="${showScore ? "548" : "534"}" fill="#FFFFFF" font-size="${showScore ? "126" : "76"}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900">${safeScoreLabel}</text>

  ${
    showScore
      ? `<text x="540" y="616" fill="rgba(255,255,255,0.40)" font-size="22" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" letter-spacing="4">FINAL SCORE</text>`
      : `<text x="540" y="604" fill="rgba(255,255,255,0.68)" font-size="26" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700">${safeKickoffLabel}</text>`
  }

  <text x="72" y="930" fill="rgba(255,255,255,0.84)" font-size="24" font-family="Arial, sans-serif" font-weight="700">${safeFooterLabel}</text>
  <text x="72" y="972" fill="rgba(255,255,255,0.38)" font-size="20" font-family="Arial, sans-serif" font-weight="800" letter-spacing="3">6-A-SIDE FOOTBALL. DONE PROPERLY.</text>
  <text x="972" y="972" fill="#6EE7B7" font-size="24" text-anchor="end" font-family="Arial, sans-serif" font-weight="900">#SIXFL</text>
</svg>`.trim();

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}