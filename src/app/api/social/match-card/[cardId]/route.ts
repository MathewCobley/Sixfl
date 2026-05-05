// ========================================
// File: src/app/api/social/match-card/[cardId]/route.ts
// ========================================

import { existsSync } from "node:fs";
import { createCanvas, registerFont, type CanvasRenderingContext2D } from "canvas";
import { SocialPostType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  formatWeeklyCardDate,
  formatWeeklyCardShortDate,
} from "@/lib/social/weekly-match-card";
import { formatTimeInLondon } from "@/lib/datetime/london";

export const runtime = "nodejs";

const WIDTH = 1080;
const HEIGHT = 1350;
const FONT_FAMILY = "SIXFLSocialSans";

let fontsRegistered = false;
let hasRegisteredFont = false;

function registerSocialCardFonts() {
  if (fontsRegistered) return;

  fontsRegistered = true;

  const fontCandidates = [
    { path: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", weight: "normal" },
    { path: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", weight: "bold" },
    { path: "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf", weight: "normal" },
    { path: "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf", weight: "bold" },
    { path: "/usr/share/fonts/truetype/freefont/FreeSans.ttf", weight: "normal" },
    { path: "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf", weight: "bold" },
  ];

  for (const candidate of fontCandidates) {
    if (!existsSync(candidate.path)) continue;

    try {
      registerFont(candidate.path, {
        family: FONT_FAMILY,
        weight: candidate.weight,
      });
      hasRegisteredFont = true;
    } catch {
      // Continue through the remaining candidates. The route can still render
      // with canvas defaults if no server font is available.
    }
  }
}

type CardRow = {
  id: string;
  leagueName: string;
  season: string | null;
  fixtureDate: Date;
  postType: SocialPostType;
};

type FixtureRow = {
  id: string;
  kickoffAt: Date;
  pitch: string | null;
  status: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
};

function font(weight: number, size: number) {
  const fontWeight = weight >= 700 ? "bold" : "normal";
  const family = hasRegisteredFont ? FONT_FAMILY : "sans-serif";

  return `${fontWeight} ${size}px ${family}`;
}

function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const clean = value.trim();
  if (ctx.measureText(clean).width <= maxWidth) return clean;

  let next = clean;
  while (next.length > 1 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1).trimEnd();
  }

  return `${next}...`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string | CanvasGradient,
) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  strokeStyle: string,
  lineWidth = 1,
) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function getTitle(postType: SocialPostType) {
  if (postType === "RESULT") return "RESULTS";
  if (postType === "UPDATE") return "FIXTURE UPDATE";
  return "MATCH NIGHT";
}

function getSubtitle(postType: SocialPostType) {
  if (postType === "RESULT") return "This week's scores";
  if (postType === "UPDATE") return "Latest match-night changes";
  return "This week's fixtures";
}

function getFixtureLine(fixture: FixtureRow, postType: SocialPostType) {
  if (
    postType === "RESULT" &&
    fixture.homeScore !== null &&
    fixture.awayScore !== null
  ) {
    return {
      left: fixture.homeTeamName,
      middle: `${fixture.homeScore} - ${fixture.awayScore}`,
      right: fixture.awayTeamName,
      meta: fixture.pitch || "Final score",
    };
  }

  return {
    left: fixture.homeTeamName,
    middle: "v",
    right: fixture.awayTeamName,
    meta: [formatTimeInLondon(fixture.kickoffAt), fixture.pitch]
      .filter(Boolean)
      .join(" - "),
  };
}

function drawRow(
  ctx: CanvasRenderingContext2D,
  fixture: FixtureRow,
  postType: SocialPostType,
  y: number,
) {
  const line = getFixtureLine(fixture, postType);

  fillRoundedRect(ctx, 90, y, 900, 74, 24, "rgba(255,255,255,0.07)");
  strokeRoundedRect(ctx, 90, y, 900, 74, 24, "rgba(255,255,255,0.12)");

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = font(700, 20);
  ctx.fillStyle = "#94A3B8";
  ctx.fillText(fitText(ctx, line.meta || "SIXFL", 440), 126, y + 31);

  if (fixture.status === "POSTPONED" || fixture.status === "CANCELLED") {
    ctx.textAlign = "right";
    ctx.font = font(800, 20);
    ctx.fillStyle = "#FDE68A";
    ctx.fillText(fixture.status, 938, y + 31);
  }

  ctx.font = font(800, 28);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.fillText(fitText(ctx, line.left, 340), 126, y + 58);

  ctx.font = font(900, 32);
  ctx.fillStyle = "#34D399";
  ctx.textAlign = "center";
  ctx.fillText(line.middle, 540, y + 58);

  ctx.font = font(800, 28);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "right";
  ctx.fillText(fitText(ctx, line.right, 340), 954, y + 58);
}

function drawCard(card: CardRow, fixtures: FixtureRow[]) {
  registerSocialCardFonts();

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const topGlow = ctx.createRadialGradient(540, 0, 0, 540, 0, 760);
  topGlow.addColorStop(0, "rgba(16,185,129,0.38)");
  topGlow.addColorStop(1, "rgba(2,6,23,0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(16,185,129,0.09)";
  ctx.beginPath();
  ctx.arc(118, 160, 230, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(52,211,153,0.08)";
  ctx.beginPath();
  ctx.arc(954, 1236, 300, 0, Math.PI * 2);
  ctx.fill();

  fillRoundedRect(ctx, 54, 54, 972, 1242, 54, "rgba(255,255,255,0.035)");
  strokeRoundedRect(ctx, 54, 54, 972, 1242, 54, "rgba(255,255,255,0.12)");

  const panel = ctx.createLinearGradient(90, 250, 990, 1120);
  panel.addColorStop(0, "rgba(15,23,42,0.96)");
  panel.addColorStop(1, "rgba(2,6,23,0.98)");
  fillRoundedRect(ctx, 90, 250, 900, 900, 44, panel);
  strokeRoundedRect(ctx, 90, 250, 900, 900, 44, "rgba(255,255,255,0.12)");

  const title = getTitle(card.postType);
  const subtitle = getSubtitle(card.postType);
  const dateLabel = formatWeeklyCardDate(card.fixtureDate);
  const shortDateLabel = formatWeeklyCardShortDate(card.fixtureDate).toUpperCase();
  const leagueLabel = card.season
    ? `${card.leagueName} - ${card.season}`
    : card.leagueName;

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = font(900, 30);
  ctx.fillStyle = "#34D399";
  ctx.fillText("SIXFL", 90, 128);

  ctx.textAlign = "right";
  ctx.font = font(800, 20);
  ctx.fillStyle = "#A7F3D0";
  ctx.fillText(shortDateLabel, 990, 128);

  ctx.textAlign = "left";
  ctx.font = font(900, 74);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(title, 90, 206);

  ctx.font = font(700, 28);
  ctx.fillStyle = "#94A3B8";
  ctx.fillText(subtitle, 94, 250);

  ctx.textAlign = "center";
  ctx.font = font(800, 25);
  ctx.fillStyle = "#A7F3D0";
  ctx.fillText(fitText(ctx, leagueLabel.toUpperCase(), 780), 540, 330);

  ctx.font = font(900, 32);
  ctx.fillStyle = "#F8FAFC";
  ctx.fillText(dateLabel, 540, 372);

  const visibleFixtures = fixtures.slice(0, 8);
  const startY = 430;
  const rowGap = 96;

  visibleFixtures.forEach((fixture, index) => {
    drawRow(ctx, fixture, card.postType, startY + index * rowGap);
  });

  if (fixtures.length > visibleFixtures.length) {
    ctx.textAlign = "center";
    ctx.font = font(800, 24);
    ctx.fillStyle = "#A7F3D0";
    ctx.fillText(
      `+ ${fixtures.length - visibleFixtures.length} more fixtures`,
      540,
      startY + visibleFixtures.length * rowGap + 28,
    );
  }

  fillRoundedRect(ctx, 90, 1186, 900, 70, 26, "rgba(16,185,129,0.14)");
  strokeRoundedRect(ctx, 90, 1186, 900, 70, 26, "rgba(52,211,153,0.24)");

  ctx.textAlign = "center";
  ctx.font = font(900, 28);
  ctx.fillStyle = "#D1FAE5";
  ctx.fillText("6-a-side football. Done properly.", 540, 1229);

  ctx.font = font(700, 20);
  ctx.fillStyle = "#64748B";
  ctx.fillText("sixfl.co.uk", 540, 1288);

  return canvas.toBuffer("image/png");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  const { cardId } = await context.params;

  const cards = await prisma.$queryRaw<CardRow[]>`
    SELECT
      c."id",
      l."name" AS "leagueName",
      l."season",
      c."fixtureDate",
      c."postType"
    FROM "SocialMatchCard" c
    INNER JOIN "League" l ON l."id" = c."leagueId"
    WHERE c."id" = ${cardId}
    LIMIT 1
  `;

  const card = cards[0];

  if (!card) {
    return new Response("Weekly social match card not found", { status: 404 });
  }

  const fixtures = await prisma.$queryRaw<FixtureRow[]>`
    SELECT
      f."id",
      f."kickoffAt",
      f."pitch",
      f."status",
      ht."name" AS "homeTeamName",
      at."name" AS "awayTeamName",
      r."homeScore",
      r."awayScore"
    FROM "SocialMatchCardFixture" cf
    INNER JOIN "Fixture" f ON f."id" = cf."fixtureId"
    INNER JOIN "Team" ht ON ht."id" = f."homeTeamId"
    INNER JOIN "Team" at ON at."id" = f."awayTeamId"
    LEFT JOIN "MatchResult" r ON r."fixtureId" = f."id"
    WHERE cf."socialMatchCardId" = ${cardId}
    ORDER BY cf."position" ASC, f."kickoffAt" ASC
  `;

  const output = drawCard(card, fixtures);

  return new Response(new Uint8Array(output), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
