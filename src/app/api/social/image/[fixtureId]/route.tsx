// ========================================
// File: src/app/api/social/image/[fixtureId]/route.tsx
// ========================================

import { ImageResponse } from "next/og";
import { SocialPostType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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

  const showScore = postType === "RESULT" && scoreLabel;

  const footerLabel =
    postType === "FIXTURE"
      ? `${kickoffLabel} • ${venueLabel}`
      : venueLabel;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1080px",
          height: "1080px",
          display: "flex",
          position: "relative",
          fontFamily: "Arial, sans-serif",
          background:
            "radial-gradient(circle at top, rgba(30,90,67,0.35), rgba(6,10,14,1) 55%)",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            padding: "64px",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 30,
                letterSpacing: "0.28em",
                fontWeight: 700,
                color: "rgba(110,231,183,0.92)",
              }}
            >
              {headerLabel}
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: "0.18em",
              }}
            >
              SIXFL
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 34,
                color: "rgba(255,255,255,0.75)",
              }}
            >
              {leagueLabel}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "18px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                borderRadius: "32px",
                padding: "40px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontSize: 62,
                    fontWeight: 800,
                    maxWidth: "42%",
                  }}
                >
                  {fixture.homeTeam.name}
                </div>

                <div
                  style={{
                    display: "flex",
                    fontSize: showScore ? 110 : 64,
                    fontWeight: 900,
                    color: showScore ? "#ffffff" : "rgba(255,255,255,0.84)",
                    textAlign: "center",
                  }}
                >
                  {showScore ? scoreLabel : "VS"}
                </div>

                <div
                  style={{
                    display: "flex",
                    fontSize: 62,
                    fontWeight: 800,
                    maxWidth: "42%",
                    textAlign: "right",
                    justifyContent: "flex-end",
                  }}
                >
                  {fixture.awayTeam.name}
                </div>
              </div>

              {!showScore ? (
                <div
                  style={{
                    display: "flex",
                    fontSize: 28,
                    color: "rgba(255,255,255,0.62)",
                  }}
                >
                  {kickoffLabel}
                </div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "end",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 26,
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                {footerLabel}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  color: "rgba(255,255,255,0.46)",
                  letterSpacing: "0.12em",
                }}
              >
                6-A-SIDE FOOTBALL. DONE PROPERLY.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: "rgba(110,231,183,0.92)",
                fontWeight: 700,
              }}
            >
              #SIXFL
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
    },
  );
}