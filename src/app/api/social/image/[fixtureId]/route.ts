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

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fitText(value: string, max = 26) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function formatKickoff(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  })
    .format(date)
    .replace(",", " •")
    .replace("am", "AM")
    .replace("pm", "PM");
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

function textSvg(input: {
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontWeight?: number;
  color?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  letterSpacing?: number;
}) {
  const {
    width,
    height,
    text,
    fontSize,
    fontWeight = 700,
    color = "#FFFFFF",
    align = "center",
    valign = "middle",
    letterSpacing = 0,
  } = input;

  const x = align === "left" ? 0 : align === "right" ? width : width / 2;
  const y = valign === "top" ? fontSize : valign === "bottom" ? height : height / 2;

  const anchor =
    align === "left" ? "start" : align === "right" ? "end" : "middle";

  const baseline =
    valign === "top" ? "hanging" : valign === "bottom" ? "text-after-edge" : "middle";

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .t {
          font-family: Arial, Helvetica, sans-serif;
          font-size: ${fontSize}px;
          font-weight: ${fontWeight};
          fill: ${color};
          letter-spacing: ${letterSpacing}px;
        }
      </style>
      <text
        x="${x}"
        y="${y}"
        text-anchor="${anchor}"
        dominant-baseline="${baseline}"
        class="t"
      >${escapeXml(text)}</text>
    </svg>
  `.trim());
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

  const homeName = fitText(fixture.homeTeam.name, 22);
  const awayName = fitText(fixture.awayTeam.name, 22);
  const leagueName = fitText(fixture.league.name, 42);
  const venueName = fitText(fixture.venue?.name ?? "Venue TBC", 36);
  const kickoffText = formatKickoff(fixture.kickoffAt);

  const composites: sharp.OverlayOptions[] = [];

  if (homeLogoBuffer) {
    const homeLogo = await sharp(homeLogoBuffer)
      .resize(220, 220, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    composites.push({
      input: homeLogo,
      left: 135,
      top: 355,
    });
  }

  if (awayLogoBuffer) {
    const awayLogo = await sharp(awayLogoBuffer)
      .resize(220, 220, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    composites.push({
      input: awayLogo,
      left: 725,
      top: 355,
    });
  }

  composites.push(
    {
      input: textSvg({
        width: 760,
        height: 50,
        text: leagueName,
        fontSize: 28,
        fontWeight: 700,
        color: "#F4F7FA",
      }),
      left: 160,
      top: 238,
    },
    {
      input: textSvg({
        width: 280,
        height: 60,
        text: homeName,
        fontSize: 32,
        fontWeight: 800,
        color: "#FFFFFF",
      }),
      left: 105,
      top: 685,
    },
    {
      input: textSvg({
        width: 280,
        height: 60,
        text: awayName,
        fontSize: 32,
        fontWeight: 800,
        color: "#FFFFFF",
      }),
      left: 695,
      top: 685,
    },
    {
      input: textSvg({
        width: 420,
        height: 64,
        text: venueName,
        fontSize: 34,
        fontWeight: 800,
        color: "#FFFFFF",
      }),
      left: 330,
      top: 810,
    },
    {
      input: textSvg({
        width: 420,
        height: 48,
        text: kickoffText,
        fontSize: 24,
        fontWeight: 700,
        color: "#F4F7FA",
      }),
      left: 330,
      top: 875,
    },
  );

  const output = await base.composite(composites).png().toBuffer();

  return new Response(output, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}