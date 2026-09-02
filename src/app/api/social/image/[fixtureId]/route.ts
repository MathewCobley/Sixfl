// ========================================
// File: src/app/api/social/image/[fixtureId]/route.ts
// ========================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const WIDTH = 1080;
const HEIGHT = 1080;

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

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgFontSize(text: string, preferred: number, maxWidth: number) {
  // A lightweight approximation is sufficient here and avoids pulling the
  // native node-canvas package into this Vercel function. Inter/Arial average
  // glyph width is roughly 0.56em for the all-caps/team-name text we render.
  const estimatedWidth = Math.max(1, text.length) * preferred * 0.56;
  if (estimatedWidth <= maxWidth) return preferred;
  return Math.max(16, Math.floor((maxWidth / (text.length * 0.56)) / 2) * 2);
}

function textNode(input: {
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  fontSize: number;
  weight?: number;
  color?: string;
}) {
  const size = svgFontSize(input.text, input.fontSize, input.maxWidth);
  return `<text x="${input.x}" y="${input.y}" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${input.weight ?? 700}" fill="${input.color ?? "#FFFFFF"}">${xml(input.text)}</text>`;
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
    if (!response.ok) throw new Error(`Failed to fetch image: ${src}`);
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
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();
}

function getTemplateName(input: {
  socialPostType: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}) {
  if (
    input.socialPostType === "RESULT" ||
    (input.status === "COMPLETED" && input.homeScore !== null && input.awayScore !== null)
  ) {
    return "result-card-master.png";
  }

  if (
    input.socialPostType === "UPDATE" ||
    input.status === "POSTPONED" ||
    input.status === "CANCELLED"
  ) {
    return "update-card-master.png";
  }

  return "fixture-card-master.png";
}

function getUpdateHeadline(status: string) {
  if (status === "POSTPONED") return "POSTPONED";
  if (status === "CANCELLED") return "CANCELLED";
  return "FIXTURE UPDATE";
}

function buildTextLayer(input: {
  templateName: string;
  status: string;
  leagueName: string;
  homeName: string;
  awayName: string;
  venueName: string;
  kickoffText: string;
  scoreText: string | null;
}) {
  const isResult = input.templateName === "result-card-master.png";
  const isUpdate = input.templateName === "update-card-master.png";
  const nodes = [
    textNode({
      text: input.leagueName,
      x: 540,
      y: 267,
      maxWidth: 860,
      fontSize: 24,
      weight: 700,
      color: "#F4F7FA",
    }),
  ];

  if (isResult) {
    nodes.push(
      textNode({ text: input.homeName, x: 280, y: 645, maxWidth: 340, fontSize: 38, weight: 800 }),
      textNode({ text: input.awayName, x: 800, y: 645, maxWidth: 340, fontSize: 38, weight: 800 }),
      textNode({ text: input.scoreText ?? "0 - 0", x: 540, y: 520, maxWidth: 280, fontSize: 86, weight: 800 }),
    );
  } else if (isUpdate) {
    nodes.push(
      textNode({ text: getUpdateHeadline(input.status), x: 540, y: 520, maxWidth: 320, fontSize: 52, weight: 800 }),
      textNode({ text: input.homeName, x: 280, y: 645, maxWidth: 340, fontSize: 38, weight: 800 }),
      textNode({ text: input.awayName, x: 800, y: 645, maxWidth: 340, fontSize: 38, weight: 800 }),
    );
  } else {
    nodes.push(
      textNode({ text: input.homeName, x: 280, y: 645, maxWidth: 340, fontSize: 40, weight: 800 }),
      textNode({ text: input.awayName, x: 800, y: 645, maxWidth: 340, fontSize: 40, weight: 800 }),
    );
  }

  nodes.push(
    textNode({ text: input.venueName, x: 540, y: 842, maxWidth: 500, fontSize: 34, weight: 800 }),
    textNode({ text: input.kickoffText, x: 540, y: 905, maxWidth: 500, fontSize: 24, weight: 700, color: "#F4F7FA" }),
  );

  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${nodes.join("")}</svg>`);
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
      kickoffAt: true,
      status: true,
      socialPostType: true,
      league: { select: { name: true } },
      venue: { select: { name: true } },
      homeTeam: { select: { name: true, logoUrl: true } },
      awayTeam: { select: { name: true, logoUrl: true } },
      result: { select: { homeScore: true, awayScore: true } },
    },
  });

  if (!fixture || !fixture.homeTeam || !fixture.awayTeam || !fixture.league) {
    return new Response("Fixture not found", { status: 404 });
  }

  const homeScore = fixture.result?.homeScore ?? null;
  const awayScore = fixture.result?.awayScore ?? null;
  const templateName = getTemplateName({
    socialPostType: fixture.socialPostType,
    status: fixture.status,
    homeScore,
    awayScore,
  });
  const templatePath = path.join(process.cwd(), "public", "social", "templates", templateName);

  const [homeLogoBuffer, awayLogoBuffer] = await Promise.all([
    loadImageBuffer(fixture.homeTeam.logoUrl),
    loadImageBuffer(fixture.awayTeam.logoUrl),
  ]);
  const [homeBadge, awayBadge] = await Promise.all([
    homeLogoBuffer ? makeBadgeBox(homeLogoBuffer, 260) : null,
    awayLogoBuffer ? makeBadgeBox(awayLogoBuffer, 260) : null,
  ]);

  const homeName = normaliseText(fitText(fixture.homeTeam.name, 22));
  const awayName = normaliseText(fitText(fixture.awayTeam.name, 22));
  const leagueName = normaliseText(fitText(fixture.league.name, 58));
  const venueName = normaliseText(fitText(fixture.venue?.name ?? "Venue TBC", 36));
  const kickoffText = formatKickoff(fixture.kickoffAt);
  const scoreText = homeScore !== null && awayScore !== null ? `${homeScore} - ${awayScore}` : null;
  const isResult = templateName === "result-card-master.png";
  const isUpdate = templateName === "update-card-master.png";

  const composites: sharp.OverlayOptions[] = [];
  if (homeBadge) {
    composites.push({ input: homeBadge, left: 150, top: isResult || isUpdate ? 320 : 350 });
  }
  if (awayBadge) {
    composites.push({ input: awayBadge, left: 670, top: isResult || isUpdate ? 320 : 350 });
  }
  composites.push({
    input: buildTextLayer({
      templateName,
      status: fixture.status,
      leagueName,
      homeName,
      awayName,
      venueName,
      kickoffText,
      scoreText,
    }),
    left: 0,
    top: 0,
  });

  const output = await sharp(templatePath)
    .resize(WIDTH, HEIGHT)
    .composite(composites)
    .png()
    .toBuffer();

  return new Response(new Uint8Array(output), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
