// ========================================
// File: src/app/api/admin/night-board/night-fixtures/route.ts
// ========================================

import path from "node:path";
import { FixtureStatus } from "@prisma/client";
import {
  createCanvas,
  loadImage,
  registerFont,
  type CanvasRenderingContext2D,
  type Image,
} from "canvas";

import {
  formatTimeInLondon,
  parseLondonDateTime,
  toLondonDateInputValue,
} from "@/lib/datetime/london";
import { calculateFixtureWinChance } from "@/lib/fixtures/winChance";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const WIDTH = 842;
const HEIGHT = 595;
const SCALE = 2;
const MARGIN = 28;
const HEADER_HEIGHT = 104;
const FOOTER_HEIGHT = 22;
const COLUMN_GAP = 22;
const MAX_FIXTURES_PER_PITCH = 6;
const TEAL = "#078f7e";
const DARK = "#17201d";
const MUTED = "#64706b";
const LINE = "#b9d8d2";
const PALE = "#f2faf8";
const VISIBLE_STATUSES = [FixtureStatus.SCHEDULED, FixtureStatus.COMPLETED] as const;

const FONT_REGULAR = path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
const LOGO_PATH = path.join(process.cwd(), "public", "logo2.png");
const FONT_FAMILY = "SixflInter";

let fontsRegistered = false;

function ensureFontsRegistered() {
  if (fontsRegistered) return;
  try {
    registerFont(FONT_REGULAR, { family: FONT_FAMILY, weight: "normal" });
    registerFont(FONT_BOLD, { family: FONT_FAMILY, weight: "bold" });
  } catch (error) {
    console.error("Could not register night fixture PDF fonts; using fallback.", error);
  }
  fontsRegistered = true;
}

function font(size: number, bold = false) {
  return `${bold ? "bold " : ""}${size}px ${FONT_FAMILY}, Arial, sans-serif`;
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validDate(value: string | null) {
  const date = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function nextDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(
    value.getUTCDate(),
  ).padStart(2, "0")}`;
}

function dateLabel(value: Date) {
  return cleanText(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(value),
  );
}

function write(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  options?: {
    font?: string;
    fill?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
  },
) {
  ctx.save();
  ctx.font = options?.font ?? font(10);
  ctx.fillStyle = options?.fill ?? DARK;
  ctx.textAlign = options?.align ?? "left";
  ctx.textBaseline = options?.baseline ?? "alphabetic";
  ctx.fillText(cleanText(value), x, y);
  ctx.restore();
}

function fit(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const clean = cleanText(value);
  if (ctx.measureText(clean).width <= maxWidth) return clean;
  let output = clean;
  while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output.trim()}...`;
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

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  direction: "left" | "right",
) {
  ctx.save();
  ctx.fillStyle = TEAL;
  ctx.beginPath();
  if (direction === "left") {
    ctx.moveTo(x, y + height / 2);
    ctx.lineTo(x + height * 0.62, y);
    ctx.lineTo(x + height * 0.62, y + height * 0.28);
    ctx.lineTo(x + width, y + height * 0.28);
    ctx.lineTo(x + width, y + height * 0.72);
    ctx.lineTo(x + height * 0.62, y + height * 0.72);
    ctx.lineTo(x + height * 0.62, y + height);
  } else {
    ctx.moveTo(x + width, y + height / 2);
    ctx.lineTo(x + width - height * 0.62, y);
    ctx.lineTo(x + width - height * 0.62, y + height * 0.28);
    ctx.lineTo(x, y + height * 0.28);
    ctx.lineTo(x, y + height * 0.72);
    ctx.lineTo(x + width - height * 0.62, y + height * 0.72);
    ctx.lineTo(x + width - height * 0.62, y + height);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

type FixtureRow = Awaited<ReturnType<typeof getFixtures>>[number];
type PrintableFixture = FixtureRow & {
  prediction: ReturnType<typeof calculateFixtureWinChance> | null;
};

function pitchNumber(value: string | null) {
  const clean = cleanText(value).toLowerCase();
  if (/^(pitch\s*)?1$/.test(clean)) return 1;
  if (/^(pitch\s*)?2$/.test(clean)) return 2;
  return null;
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  logo: Image | null,
  input: { date: string; league: string; venue: string; page: number; pages: number },
) {
  if (logo) {
    const maxWidth = 154;
    const maxHeight = 54;
    const ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    ctx.drawImage(logo, MARGIN, 18, logo.width * ratio, logo.height * ratio);
  } else {
    write(ctx, "SIXFL", MARGIN, 55, { font: font(34, true), fill: TEAL });
  }

  write(ctx, "NIGHT FIXTURES", WIDTH / 2, 48, {
    font: font(28, true),
    align: "center",
  });
  write(ctx, "A4 LANDSCAPE MATCH-NIGHT LIST", WIDTH / 2, 68, {
    font: font(8, true),
    fill: TEAL,
    align: "center",
  });

  const metaX = WIDTH - MARGIN - 210;
  write(ctx, `LEAGUE: ${fit(ctx, input.league, 150)}`, metaX, 25, {
    font: font(8.5, true),
  });
  write(ctx, `VENUE: ${fit(ctx, input.venue, 150)}`, metaX, 45, {
    font: font(8.5, true),
  });
  write(ctx, `DATE: ${input.date}`, metaX, 65, { font: font(8.5, true) });
  if (input.pages > 1) {
    write(ctx, `PAGE ${input.page}/${input.pages}`, WIDTH - MARGIN, 88, {
      font: font(7.5, true),
      fill: MUTED,
      align: "right",
    });
  }

  ctx.strokeStyle = TEAL;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN, HEADER_HEIGHT - 10);
  ctx.lineTo(WIDTH - MARGIN, HEADER_HEIGHT - 10);
  ctx.stroke();
}

function drawPitchHeading(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  pitch: 1 | 2,
) {
  const arrowWidth = 82;
  const arrowHeight = 34;
  if (pitch === 1) {
    drawArrow(ctx, x + 4, y + 2, arrowWidth, arrowHeight, "left");
  } else {
    drawArrow(ctx, x + width - arrowWidth - 4, y + 2, arrowWidth, arrowHeight, "right");
  }
  write(ctx, `PITCH ${pitch}`, x + width / 2, y + 30, {
    font: font(23, true),
    align: "center",
  });
}

function drawFixtureRow(
  ctx: CanvasRenderingContext2D,
  fixture: PrintableFixture,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  roundedRect(ctx, x, y, width, height, 7);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  const timeWidth = 62;
  const predictorWidth = 90;
  ctx.fillStyle = PALE;
  roundedRect(ctx, x, y, timeWidth, height, 7);
  ctx.fill();
  ctx.fillStyle = TEAL;
  ctx.fillRect(x, y, 5, height);

  write(ctx, formatTimeInLondon(fixture.kickoffAt), x + timeWidth / 2, y + height / 2 + 1, {
    font: font(16, true),
    fill: DARK,
    align: "center",
    baseline: "middle",
  });

  const teamsX = x + timeWidth + 12;
  const teamsWidth = width - timeWidth - predictorWidth - 30;
  write(ctx, fit(ctx, fixture.homeTeam.name, teamsWidth), teamsX, y + height / 2 - 7, {
    font: font(11, true),
  });
  write(ctx, "vs", teamsX, y + height / 2 + 7, {
    font: font(7.5, true),
    fill: TEAL,
  });
  write(ctx, fit(ctx, fixture.awayTeam.name, teamsWidth), teamsX + 18, y + height / 2 + 7, {
    font: font(11, true),
  });

  const dividerX = x + width - predictorWidth;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(dividerX, y + 9);
  ctx.lineTo(dividerX, y + height - 9);
  ctx.stroke();

  const prediction = fixture.prediction?.predictedResult.label ?? "Unavailable";
  write(ctx, "AI PREDICTOR", dividerX + predictorWidth / 2, y + 17, {
    font: font(6.5, true),
    fill: TEAL,
    align: "center",
  });
  write(ctx, prediction, dividerX + predictorWidth / 2, y + height / 2 + 10, {
    font: font(prediction.length > 10 ? 11 : 18, true),
    align: "center",
  });
}

function drawPitchColumn(
  ctx: CanvasRenderingContext2D,
  fixtures: PrintableFixture[],
  x: number,
  y: number,
  width: number,
  height: number,
  pitch: 1 | 2,
) {
  roundedRect(ctx, x, y, width, height, 12);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = TEAL;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawPitchHeading(ctx, x + 12, y + 8, width - 24, pitch);
  const listTop = y + 54;
  const listBottom = y + height - 12;

  if (fixtures.length === 0) {
    write(ctx, "No fixtures assigned to this pitch.", x + width / 2, listTop + 48, {
      font: font(11, true),
      fill: MUTED,
      align: "center",
    });
    return;
  }

  const rowGap = 8;
  const rowHeight = Math.min(
    65,
    Math.floor((listBottom - listTop - rowGap * (fixtures.length - 1)) / fixtures.length),
  );

  fixtures.forEach((fixture, index) => {
    drawFixtureRow(ctx, fixture, x + 12, listTop + index * (rowHeight + rowGap), width - 24, rowHeight);
  });
}

function uniqueLabel(values: Array<string | null | undefined>, fallback: string) {
  const unique = Array.from(new Set(values.map(cleanText).filter(Boolean)));
  if (unique.length === 0) return fallback;
  return unique.length === 1 ? unique[0] : "Multiple";
}

function drawFooter(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(MARGIN, HEIGHT - FOOTER_HEIGHT);
  ctx.lineTo(WIDTH - MARGIN, HEIGHT - FOOTER_HEIGHT);
  ctx.stroke();
  write(ctx, "Please check your pitch direction before kick-off.", MARGIN, HEIGHT - 7, {
    font: font(6.8),
    fill: MUTED,
  });
  write(ctx, "SIXFL - 6-a-side. Done properly.", WIDTH - MARGIN, HEIGHT - 7, {
    font: font(6.8, true),
    fill: TEAL,
    align: "right",
  });
}

async function drawRasterPage(
  pitch1: PrintableFixture[],
  pitch2: PrintableFixture[],
  input: { date: string; league: string; venue: string; page: number; pages: number },
  logo: Image | null,
) {
  const canvas = createCanvas(WIDTH * SCALE, HEIGHT * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawHeader(ctx, logo, input);

  const contentY = HEADER_HEIGHT;
  const contentHeight = HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT - 6;
  const columnWidth = (WIDTH - MARGIN * 2 - COLUMN_GAP) / 2;

  drawPitchColumn(ctx, pitch1, MARGIN, contentY, columnWidth, contentHeight, 1);
  drawPitchColumn(
    ctx,
    pitch2,
    MARGIN + columnWidth + COLUMN_GAP,
    contentY,
    columnWidth,
    contentHeight,
    2,
  );
  drawFooter(ctx);
  return canvas;
}

async function createPdf(fixtures: PrintableFixture[], label: string) {
  ensureFontsRegistered();
  let logo: Image | null = null;
  try {
    logo = await loadImage(LOGO_PATH);
  } catch (error) {
    console.error("Could not load official SIXFL logo for night fixture PDF.", error);
  }

  const pitch1All = fixtures.filter((fixture) => pitchNumber(fixture.pitch) === 1);
  const pitch2All = fixtures.filter((fixture) => pitchNumber(fixture.pitch) === 2);
  const pages = Math.max(
    1,
    Math.ceil(pitch1All.length / MAX_FIXTURES_PER_PITCH),
    Math.ceil(pitch2All.length / MAX_FIXTURES_PER_PITCH),
  );
  const league = uniqueLabel(fixtures.map((fixture) => fixture.league.name), "League not assigned");
  const venue = uniqueLabel(
    fixtures.map((fixture) => fixture.venue?.name || fixture.league.venueName),
    "Venue not assigned",
  );

  const pdfCanvas = createCanvas(WIDTH, HEIGHT, "pdf");
  const pdfContext = pdfCanvas.getContext("2d");

  for (let page = 0; page < pages; page += 1) {
    if (page > 0) pdfContext.addPage(WIDTH, HEIGHT);
    const raster = await drawRasterPage(
      pitch1All.slice(page * MAX_FIXTURES_PER_PITCH, (page + 1) * MAX_FIXTURES_PER_PITCH),
      pitch2All.slice(page * MAX_FIXTURES_PER_PITCH, (page + 1) * MAX_FIXTURES_PER_PITCH),
      { date: label, league, venue, page: page + 1, pages },
      logo,
    );
    pdfContext.drawImage(raster, 0, 0, WIDTH, HEIGHT);
  }

  return pdfCanvas.toBuffer("application/pdf", {
    title: `SIXFL night fixtures - ${label}`,
    author: "SIXFL",
    subject: "A4 landscape pitch directions, fixtures, kick-off times and AI predictions",
    keywords: "SIXFL, night fixtures, pitch, kick-off, AI predictor, A4 landscape",
    creationDate: new Date(),
  });
}

async function getFixtures(input: {
  start: Date;
  end: Date;
  leagueId: string;
  venueId: string;
}) {
  return prisma.fixture.findMany({
    where: {
      publishedAt: { not: null },
      kickoffAt: { gte: input.start, lt: input.end },
      status: { in: [...VISIBLE_STATUSES] },
      ...(input.leagueId ? { leagueId: input.leagueId } : {}),
      ...(input.venueId ? { venueId: input.venueId } : {}),
    },
    orderBy: [{ pitch: "asc" }, { kickoffAt: "asc" }],
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      pitch: true,
      status: true,
      league: { select: { name: true, venueName: true } },
      venue: { select: { name: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      result: { select: { homeScore: true, awayScore: true } },
    },
  });
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const leagueId = cleanText(url.searchParams.get("leagueId"));
  const venueId = cleanText(url.searchParams.get("venueId"));
  let date = validDate(url.searchParams.get("date"));

  if (!date) {
    const nextFixture = await prisma.fixture.findFirst({
      where: {
        publishedAt: { not: null },
        kickoffAt: { gte: new Date() },
        status: { in: [...VISIBLE_STATUSES] },
        ...(leagueId ? { leagueId } : {}),
        ...(venueId ? { venueId } : {}),
      },
      orderBy: { kickoffAt: "asc" },
      select: { kickoffAt: true },
    });
    date = toLondonDateInputValue(nextFixture?.kickoffAt ?? new Date());
  }

  const start = parseLondonDateTime(date, "00:00");
  const end = parseLondonDateTime(nextDate(date), "00:00");
  const fixtures = await getFixtures({ start, end, leagueId, venueId });
  const leagueIds = Array.from(new Set(fixtures.map((fixture) => fixture.leagueId)));

  const history = leagueIds.length
    ? await prisma.fixture.findMany({
        where: { leagueId: { in: leagueIds } },
        select: {
          leagueId: true,
          kickoffAt: true,
          status: true,
          homeTeam: { select: { id: true } },
          awayTeam: { select: { id: true } },
          result: { select: { homeScore: true, awayScore: true } },
        },
      })
    : [];

  const historyByLeague = new Map<string, typeof history>();
  for (const fixture of history) {
    historyByLeague.set(fixture.leagueId, [
      ...(historyByLeague.get(fixture.leagueId) ?? []),
      fixture,
    ]);
  }

  const printable: PrintableFixture[] = fixtures.map((fixture) => ({
    ...fixture,
    prediction:
      fixture.status === FixtureStatus.SCHEDULED
        ? calculateFixtureWinChance({
            homeTeamId: fixture.homeTeam.id,
            awayTeamId: fixture.awayTeam.id,
            fixtures: historyByLeague.get(fixture.leagueId) ?? [],
          })
        : null,
  }));

  const pdf = await createPdf(printable, dateLabel(start));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="sixfl-night-fixtures-${date}.pdf"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
