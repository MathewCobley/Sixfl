// ========================================
// File: src/app/api/social/match-card/[cardId]/route.ts
// ========================================

import { createCanvas, type CanvasRenderingContext2D } from "canvas";
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

type Glyph = string[];

const GLYPHS: Record<string, Glyph> = {
  " ": ["000", "000", "000", "000", "000", "000", "000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["0", "0", "0", "0", "0", "0", "1"],
  ",": ["0", "0", "0", "0", "0", "1", "1"],
  ":": ["0", "1", "1", "0", "1", "1", "0"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "01010"],
  "'": ["1", "1", "0", "0", "0", "0", "0"],
  "!": ["1", "1", "1", "1", "1", "0", "1"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "(": ["001", "010", "100", "100", "100", "010", "001"],
  ")": ["100", "010", "001", "001", "001", "010", "100"],
};

function normaliseForGlyphs(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—•]/g, "-")
    .replace(/£/g, "GBP")
    .toUpperCase()
    .replace(/[^A-Z0-9 .,:\-\/+#&'!?()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function glyphWidth(char: string) {
  return GLYPHS[char]?.[0]?.length ?? GLYPHS["?"].length;
}

function measureBlockText(value: string, scale: number) {
  const text = normaliseForGlyphs(value);
  if (!text) return 0;

  return text.split("").reduce((sum, char, index) => {
    const width = glyphWidth(char) * scale;
    const gap = index === text.length - 1 ? 0 : scale;
    return sum + width + gap;
  }, 0);
}

function fitBlockText(value: string, scale: number, maxWidth: number) {
  const clean = normaliseForGlyphs(value);
  if (measureBlockText(clean, scale) <= maxWidth) return clean;

  let next = clean;
  while (next.length > 1 && measureBlockText(`${next}...`, scale) > maxWidth) {
    next = next.slice(0, -1).trimEnd();
  }

  return `${next}...`;
}

function drawBlockText(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  scale: number,
  color: string,
  options?: {
    align?: "left" | "center" | "right";
    maxWidth?: number;
  },
) {
  const text = options?.maxWidth
    ? fitBlockText(value, scale, options.maxWidth)
    : normaliseForGlyphs(value);
  const width = measureBlockText(text, scale);
  const align = options?.align ?? "left";
  let cursorX = x;

  if (align === "center") cursorX -= width / 2;
  if (align === "right") cursorX -= width;

  ctx.fillStyle = color;

  for (const char of text) {
    const glyph = GLYPHS[char] ?? GLYPHS["?"];

    glyph.forEach((row, rowIndex) => {
      row.split("").forEach((cell, colIndex) => {
        if (cell !== "1") return;
        ctx.fillRect(
          Math.round(cursorX + colIndex * scale),
          Math.round(y + rowIndex * scale),
          Math.ceil(scale),
          Math.ceil(scale),
        );
      });
    });

    cursorX += glyphWidth(char) * scale + scale;
  }
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
  if (postType === "RESULT") return "THIS WEEK'S SCORES";
  if (postType === "UPDATE") return "LATEST MATCH-NIGHT CHANGES";
  return "THIS WEEK'S FIXTURES";
}

function getFixtureLine(fixture: FixtureRow, postType: SocialPostType) {
  if (
    postType === "RESULT" &&
    fixture.homeScore !== null &&
    fixture.awayScore !== null
  ) {
    return {
      left: fixture.homeTeamName,
      middle: `${fixture.homeScore}-${fixture.awayScore}`,
      right: fixture.awayTeamName,
      meta: fixture.pitch || "FINAL SCORE",
    };
  }

  return {
    left: fixture.homeTeamName,
    middle: "V",
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

  drawBlockText(ctx, line.meta || "SIXFL", 126, y + 14, 3, "#94A3B8", {
    maxWidth: 430,
  });

  if (fixture.status === "POSTPONED" || fixture.status === "CANCELLED") {
    drawBlockText(ctx, fixture.status, 938, y + 14, 3, "#FDE68A", {
      align: "right",
      maxWidth: 220,
    });
  }

  drawBlockText(ctx, line.left, 126, y + 43, 4, "#FFFFFF", {
    maxWidth: 340,
  });

  drawBlockText(ctx, line.middle, 540, y + 39, 5, "#34D399", {
    align: "center",
    maxWidth: 110,
  });

  drawBlockText(ctx, line.right, 954, y + 43, 4, "#FFFFFF", {
    align: "right",
    maxWidth: 340,
  });
}

function drawCard(card: CardRow, fixtures: FixtureRow[]) {
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

  drawBlockText(ctx, "SIXFL", 90, 100, 5, "#34D399");
  drawBlockText(ctx, shortDateLabel, 990, 104, 3, "#A7F3D0", {
    align: "right",
    maxWidth: 270,
  });
  drawBlockText(ctx, title, 90, 160, 10, "#FFFFFF", { maxWidth: 760 });
  drawBlockText(ctx, subtitle, 94, 226, 4, "#94A3B8", { maxWidth: 650 });
  drawBlockText(ctx, leagueLabel, 540, 310, 3, "#A7F3D0", {
    align: "center",
    maxWidth: 760,
  });
  drawBlockText(ctx, dateLabel, 540, 354, 4, "#F8FAFC", {
    align: "center",
    maxWidth: 660,
  });

  const visibleFixtures = fixtures.slice(0, 8);
  const startY = 430;
  const rowGap = 96;

  visibleFixtures.forEach((fixture, index) => {
    drawRow(ctx, fixture, card.postType, startY + index * rowGap);
  });

  if (fixtures.length > visibleFixtures.length) {
    drawBlockText(
      ctx,
      `+ ${fixtures.length - visibleFixtures.length} MORE FIXTURES`,
      540,
      startY + visibleFixtures.length * rowGap + 8,
      4,
      "#A7F3D0",
      { align: "center", maxWidth: 620 },
    );
  }

  fillRoundedRect(ctx, 90, 1186, 900, 70, 26, "rgba(16,185,129,0.14)");
  strokeRoundedRect(ctx, 90, 1186, 900, 70, 26, "rgba(52,211,153,0.24)");

  drawBlockText(ctx, "6-A-SIDE FOOTBALL. DONE PROPERLY.", 540, 1208, 4, "#D1FAE5", {
    align: "center",
    maxWidth: 760,
  });
  drawBlockText(ctx, "SIXFL.CO.UK", 540, 1270, 3, "#64748B", {
    align: "center",
    maxWidth: 250,
  });

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
