// ========================================
// File: src/app/api/social/image/[fixtureId]/route.ts
// ========================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  createCanvas,
  registerFont,
  type CanvasRenderingContext2D,
} from "canvas";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const WIDTH = 1080;
const HEIGHT = 1080;

const FONT_REGULAR = path.join(
  process.cwd(),
  "public",
  "fonts",
  "Inter-Regular.ttf",
);

const FONT_BOLD = path.join(
  process.cwd(),
  "public",
  "fonts",
  "Inter-Bold.ttf",
);

let fontsRegistered = false;

function ensureFontsRegistered() {
  if (fontsRegistered) return;

  try {
    registerFont(FONT_REGULAR, { family: "Inter" });
    registerFont(FONT_BOLD, { family: "Inter", weight: "700" });
    fontsRegistered = true;
  } catch {
    // Fallback to system sans-serif if custom fonts are not present.
    fontsRegistered = true;
  }
}

function fitText(value: string, max = 26) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function normaliseText(value: string) {
  return value
    .replaceAll("’", "'")
    .replaceAll("‘", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("•", "-")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .trim();
}

function formatKickoff(date: Date) {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  }).format(date);

  return normaliseText(
    formatted.replace(",", "").replace("am", "AM").replace("pm", "PM"),
  );
}

async function loadImageBuffer(src: string | null | undefined) {
  if (!src) return null;

  if (src.startsWith("http://") || src.startsWith("https://")) {
    const response = await fetch(src, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${src}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  const localPath = src.startsWith("/")
    ? path.join(process.cwd(), "public", src)
    : path.join(process.cwd(), src);

  return readFile(localPath);
}

async function makeBadgeBox(input: Buffer, boxSize = 260) {
  const trimmed = await sharp(input).trim().png().toBuffer();

  const resized = await sharp(trimmed)
    .resize(boxSize - 40, boxSize - 40, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: boxSize,
      height: boxSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resized,
        gravity: "center",
      },
    ])
    .png()
    .toBuffer();
}

function drawCenteredTextBlock(input: {
  ctx: CanvasRenderingContext2D;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  fontSize: number;
  weight?: number;
  color?: string;
}) {
  const {
    ctx,
    text,
    x,
    y,
    maxWidth,
    fontSize,
    weight = 700,
    color = "#FFFFFF",
  } = input;

  let size = fontSize;
  while (size > 16) {
    ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }

  ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ fixtureId: string }> },
) {
  ensureFontsRegistered();

  const { fixtureId } = await context.params;

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      kickoffAt: true,
      league: {
        select: {
          name: true,
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
          logoUrl: true,
        },
      },
      awayTeam: {
        select: {
          name: true,
          logoUrl: true,
        },
      },
    },
  });

  if (!fixture || !fixture.homeTeam || !fixture.awayTeam || !fixture.league) {
    return new Response("Fixture not found", { status: 404 });
  }

  const templatePath = path.join(
    process.cwd(),
    "public",
    "social",
    "templates",
    "fixture-card-master.png",
  );

  const base = sharp(templatePath).resize(WIDTH, HEIGHT);

  const homeLogoBuffer = await loadImageBuffer(fixture.homeTeam.logoUrl);
  const awayLogoBuffer = await loadImageBuffer(fixture.awayTeam.logoUrl);

  const homeBadge = homeLogoBuffer
    ? await makeBadgeBox(homeLogoBuffer, 260)
    : null;
  const awayBadge = awayLogoBuffer
    ? await makeBadgeBox(awayLogoBuffer, 260)
    : null;

  const homeName = normaliseText(fitText(fixture.homeTeam.name, 22));
  const awayName = normaliseText(fitText(fixture.awayTeam.name, 22));
  const leagueName = normaliseText(fitText(fixture.league.name, 42));
  const venueName = normaliseText(
    fitText(fixture.venue?.name ?? "Venue TBC", 36),
  );
  const kickoffText = formatKickoff(fixture.kickoffAt);

  // Build reliable text layer with node-canvas
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#FFFFFF";

  drawCenteredTextBlock({
    ctx,
    text: leagueName,
    x: 540,
    y: 267,
    maxWidth: 760,
    fontSize: 28,
    weight: 700,
    color: "#F4F7FA",
  });

  drawCenteredTextBlock({
    ctx,
    text: homeName,
    x: 280,
    y: 720,
    maxWidth: 300,
    fontSize: 32,
    weight: 800,
    color: "#FFFFFF",
  });

  drawCenteredTextBlock({
    ctx,
    text: awayName,
    x: 800,
    y: 720,
    maxWidth: 300,
    fontSize: 32,
    weight: 800,
    color: "#FFFFFF",
  });

  drawCenteredTextBlock({
    ctx,
    text: venueName,
    x: 540,
    y: 842,
    maxWidth: 500,
    fontSize: 34,
    weight: 800,
    color: "#FFFFFF",
  });

  drawCenteredTextBlock({
    ctx,
    text: kickoffText,
    x: 540,
    y: 905,
    maxWidth: 500,
    fontSize: 24,
    weight: 700,
    color: "#F4F7FA",
  });

  const textLayer = canvas.toBuffer("image/png");

  const composites: sharp.OverlayOptions[] = [];

  if (homeBadge) {
    composites.push({
      input: homeBadge,
      left: 150,
      top: 350,
    });
  }

  if (awayBadge) {
    composites.push({
      input: awayBadge,
      left: 670,
      top: 350,
    });
  }

  composites.push({
    input: textLayer,
    left: 0,
    top: 0,
  });

  const output = await base.composite(composites).png().toBuffer();
  const body = new Uint8Array(output);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}