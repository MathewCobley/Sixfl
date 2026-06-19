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
const CARD_X = 60;
const CARD_Y = 60;
const CARD_W = 960;
const CARD_H = 1230;

const COLORS = {
  background: "#020617",
  panel: "#07111F",
  panelSoft: "#0F172A",
  line: "rgba(148,163,184,0.22)",
  text: "#F8FAFC",
  muted: "#94A3B8",
  soft: "#CBD5E1",
  green: "#34D399",
  greenSoft: "#A7F3D0",
  warning: "#FDE68A",
};

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

function setFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  weight: "400" | "500" | "600" | "700" | "800" | "900" = "600",
) {
  ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
}

function cleanText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function ellipsize(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) {
  const text = cleanText(value);

  if (!text || ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let next = text;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) {
    next = next.slice(0, -1).trimEnd();
  }

  return `${next}…`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
) {
  const words = cleanText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];

  for (const word of words) {
    const current = lines[lines.length - 1] ?? "";
    const candidate = current ? `${current} ${word}` : word;

    if (ctx.measureText(candidate).width <= maxWidth) {
      if (lines.length === 0) {
        lines.push(candidate);
      } else {
        lines[lines.length - 1] = candidate;
      }
      continue;
    }

    if (lines.length < maxLines) {
      lines.push(word);
      continue;
    }

    lines[lines.length - 1] = ellipsize(ctx, `${lines[lines.length - 1]} ${word}`, maxWidth);
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  if (lines.length === maxLines) {
    lines[maxLines - 1] = ellipsize(ctx, lines[maxLines - 1], maxWidth);
  }

  return lines;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  options: {
    size: number;
    weight?: "400" | "500" | "600" | "700" | "800" | "900";
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    maxWidth?: number;
  },
) {
  setFont(ctx, options.size, options.weight ?? "600");
  ctx.fillStyle = options.color ?? COLORS.text;
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = options.baseline ?? "alphabetic";

  const text = options.maxWidth
    ? ellipsize(ctx, value, options.maxWidth)
    : cleanText(value);

  ctx.fillText(text, x, y);
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  options: {
    size: number;
    weight?: "400" | "500" | "600" | "700" | "800" | "900";
    color?: string;
    align?: CanvasTextAlign;
    maxLines?: number;
    lineHeight?: number;
  },
) {
  setFont(ctx, options.size, options.weight ?? "600");
  ctx.fillStyle = options.color ?? COLORS.text;
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = "top";

  const maxLines = options.maxLines ?? 2;
  const lineHeight = options.lineHeight ?? Math.round(options.size * 1.16);
  const lines = wrapText(ctx, value, maxWidth, maxLines);

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });

  return lines.length * lineHeight;
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: {
    fill?: string;
    stroke?: string;
    text?: string;
    size?: number;
  },
) {
  fillRoundedRect(ctx, x, y, width, height, height / 2, options?.fill ?? "rgba(52,211,153,0.12)");
  strokeRoundedRect(ctx, x, y, width, height, height / 2, options?.stroke ?? "rgba(52,211,153,0.28)");
  drawText(ctx, label, x + width / 2, y + height / 2 + 1, {
    size: options?.size ?? 24,
    weight: "800",
    color: options?.text ?? COLORS.greenSoft,
    align: "center",
    baseline: "middle",
    maxWidth: width - 28,
  });
}

function getTitle(postType: SocialPostType) {
  if (postType === "RESULT") return "Results";
  if (postType === "UPDATE") return "Fixture update";
  return "Match night";
}

function getSubtitle(postType: SocialPostType) {
  if (postType === "RESULT") return "This week’s scores";
  if (postType === "UPDATE") return "Latest match-night changes";
  return "This week’s fixtures";
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
      meta: fixture.pitch || "Final score",
    };
  }

  return {
    left: fixture.homeTeamName,
    middle: "v",
    right: fixture.awayTeamName,
    meta: [formatTimeInLondon(fixture.kickoffAt), fixture.pitch]
      .filter(Boolean)
      .join(" · "),
  };
}

function drawFixtureRow(
  ctx: CanvasRenderingContext2D,
  fixture: FixtureRow,
  postType: SocialPostType,
  y: number,
  rowHeight: number,
) {
  const line = getFixtureLine(fixture, postType);
  const rowX = 100;
  const rowW = 880;

  fillRoundedRect(ctx, rowX, y, rowW, rowHeight, 28, "rgba(15,23,42,0.92)");
  strokeRoundedRect(ctx, rowX, y, rowW, rowHeight, 28, "rgba(148,163,184,0.22)");

  drawText(ctx, line.meta || "SIXFL", rowX + 32, y + 28, {
    size: 24,
    weight: "700",
    color: COLORS.muted,
    baseline: "middle",
    maxWidth: 360,
  });

  if (fixture.status === "POSTPONED" || fixture.status === "CANCELLED") {
    drawPill(ctx, fixture.status, rowX + rowW - 190, y + 12, 158, 38, {
      fill: "rgba(253,230,138,0.12)",
      stroke: "rgba(253,230,138,0.32)",
      text: COLORS.warning,
      size: 18,
    });
  }

  const teamTop = y + 54;
  const teamWidth = 340;
  const teamFontSize = rowHeight >= 124 ? 34 : 30;

  drawWrappedText(ctx, line.left.toUpperCase(), rowX + 32, teamTop, teamWidth, {
    size: teamFontSize,
    weight: "900",
    color: COLORS.text,
    maxLines: 2,
    lineHeight: Math.round(teamFontSize * 1.04),
  });

  drawPill(ctx, line.middle.toUpperCase(), 504, y + rowHeight / 2 - 30, 72, 60, {
    fill: "rgba(52,211,153,0.16)",
    stroke: "rgba(52,211,153,0.35)",
    text: COLORS.green,
    size: postType === "RESULT" ? 24 : 30,
  });

  drawWrappedText(ctx, line.right.toUpperCase(), rowX + rowW - 32, teamTop, teamWidth, {
    size: teamFontSize,
    weight: "900",
    color: COLORS.text,
    align: "right",
    maxLines: 2,
    lineHeight: Math.round(teamFontSize * 1.04),
  });
}

function getFixtureLayout(count: number) {
  if (count <= 2) return { rowHeight: 140, rowGap: 18 };
  if (count <= 4) return { rowHeight: 124, rowGap: 16 };
  if (count <= 6) return { rowHeight: 108, rowGap: 14 };
  return { rowHeight: 96, rowGap: 12 };
}

function drawCard(card: CardRow, fixtures: FixtureRow[]) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const bgGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGradient.addColorStop(0, "rgba(16,185,129,0.35)");
  bgGradient.addColorStop(0.42, "rgba(15,23,42,0.18)");
  bgGradient.addColorStop(1, "rgba(2,6,23,0.98)");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(52,211,153,0.08)";
  ctx.beginPath();
  ctx.arc(158, 112, 280, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(14,165,233,0.07)";
  ctx.beginPath();
  ctx.arc(965, 1188, 330, 0, Math.PI * 2);
  ctx.fill();

  fillRoundedRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 54, "rgba(2,6,23,0.58)");
  strokeRoundedRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 54, "rgba(255,255,255,0.14)");

  drawPill(ctx, "SIXFL", 100, 104, 150, 52, {
    fill: "rgba(52,211,153,0.14)",
    stroke: "rgba(52,211,153,0.3)",
    text: COLORS.greenSoft,
    size: 24,
  });

  const shortDateLabel = formatWeeklyCardShortDate(card.fixtureDate).toUpperCase();
  drawPill(ctx, shortDateLabel, 730, 104, 250, 52, {
    fill: "rgba(255,255,255,0.06)",
    stroke: "rgba(255,255,255,0.14)",
    text: COLORS.soft,
    size: 22,
  });

  drawText(ctx, getTitle(card.postType), 100, 245, {
    size: 78,
    weight: "900",
    color: COLORS.text,
    baseline: "alphabetic",
    maxWidth: 840,
  });

  drawText(ctx, getSubtitle(card.postType), 104, 296, {
    size: 32,
    weight: "700",
    color: COLORS.greenSoft,
    maxWidth: 820,
  });

  const leagueLabel = card.season
    ? `${card.leagueName} · ${card.season}`
    : card.leagueName;
  const dateLabel = formatWeeklyCardDate(card.fixtureDate);

  const visibleFixtures = fixtures.slice(0, 8);
  const { rowHeight, rowGap } = getFixtureLayout(visibleFixtures.length);
  const rowsHeight = visibleFixtures.length * rowHeight + Math.max(0, visibleFixtures.length - 1) * rowGap;
  const fixturePanelHeight = Math.max(430, rowsHeight + 190);
  const fixturePanelY = 340;

  const panelGradient = ctx.createLinearGradient(100, fixturePanelY, 980, fixturePanelY + fixturePanelHeight);
  panelGradient.addColorStop(0, "rgba(15,23,42,0.94)");
  panelGradient.addColorStop(1, "rgba(2,6,23,0.98)");

  fillRoundedRect(ctx, 86, fixturePanelY, 908, fixturePanelHeight, 44, panelGradient);
  strokeRoundedRect(ctx, 86, fixturePanelY, 908, fixturePanelHeight, 44, "rgba(148,163,184,0.18)");

  drawWrappedText(ctx, leagueLabel.toUpperCase(), 540, fixturePanelY + 36, 790, {
    size: 28,
    weight: "800",
    color: COLORS.greenSoft,
    align: "center",
    maxLines: 2,
    lineHeight: 32,
  });

  drawText(ctx, dateLabel.toUpperCase(), 540, fixturePanelY + 112, {
    size: 38,
    weight: "900",
    color: COLORS.text,
    align: "center",
    baseline: "middle",
    maxWidth: 780,
  });

  const startY = fixturePanelY + 166;

  if (visibleFixtures.length === 0) {
    drawText(ctx, "No fixtures selected yet", 540, startY + 84, {
      size: 34,
      weight: "800",
      color: COLORS.muted,
      align: "center",
      baseline: "middle",
      maxWidth: 760,
    });
  } else {
    visibleFixtures.forEach((fixture, index) => {
      drawFixtureRow(
        ctx,
        fixture,
        card.postType,
        startY + index * (rowHeight + rowGap),
        rowHeight,
      );
    });
  }

  if (fixtures.length > visibleFixtures.length) {
    drawPill(
      ctx,
      `+ ${fixtures.length - visibleFixtures.length} more fixtures`,
      332,
      startY + rowsHeight + 22,
      416,
      50,
      {
        fill: "rgba(52,211,153,0.12)",
        stroke: "rgba(52,211,153,0.28)",
        text: COLORS.greenSoft,
        size: 22,
      },
    );
  }

  const footerY = 1178;
  fillRoundedRect(ctx, 100, footerY, 880, 76, 30, "rgba(52,211,153,0.15)");
  strokeRoundedRect(ctx, 100, footerY, 880, 76, 30, "rgba(52,211,153,0.26)");
  drawText(ctx, "6-a-side football. Done properly.", 540, footerY + 40, {
    size: 34,
    weight: "900",
    color: COLORS.text,
    align: "center",
    baseline: "middle",
    maxWidth: 780,
  });
  drawText(ctx, "sixfl.co.uk", 540, 1282, {
    size: 26,
    weight: "800",
    color: COLORS.muted,
    align: "center",
    baseline: "middle",
    maxWidth: 260,
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
