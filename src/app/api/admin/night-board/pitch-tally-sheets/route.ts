// ========================================
// File: src/app/api/admin/night-board/pitch-tally-sheets/route.ts
// ========================================

import path from "node:path";
import { FixtureStatus, Prisma } from "@prisma/client";
import {
  createCanvas,
  registerFont,
  type CanvasRenderingContext2D,
} from "canvas";

import {
  formatTimeInLondon,
  parseLondonDateTime,
  toLondonDateInputValue,
} from "@/lib/datetime/london";
import { calculateFixtureWinChance } from "@/lib/fixtures/winChance";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamKitColours } from "@/lib/teams/kit-colours";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const WIDTH = 420;
const HEIGHT = 595;
const RASTER_SCALE = 2;
const MARGIN = 18;
const HEADER = 60;
const FOOTER = 15;
const GAP = 8;
const MAX_PER_PAGE = 3;
const VISIBLE_STATUSES = [FixtureStatus.SCHEDULED, FixtureStatus.COMPLETED] as const;

const FONT_REGULAR = path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
const FONT_FAMILY = "SixflInter";

let fontsRegistered = false;

function ensureFontsRegistered() {
  if (fontsRegistered) return;

  try {
    registerFont(FONT_REGULAR, { family: FONT_FAMILY, weight: "normal" });
    registerFont(FONT_BOLD, { family: FONT_FAMILY, weight: "bold" });
  } catch (error) {
    console.error("Could not register pitch sheet fonts; using a system fallback.", error);
  }

  fontsRegistered = true;
}

function font(size: number, bold = false) {
  return `${bold ? "bold " : ""}${size}px ${FONT_FAMILY}, Arial, sans-serif`;
}

type TvRow = { id: string; sixflTvRecorded: boolean };
type ShinPadWarningCountRow = { teamId: string; warningCount: number };
type FixtureRow = Awaited<ReturnType<typeof getFixtures>>[number];
type PrintableFixture = FixtureRow & {
  isTv: boolean;
  homeKitColour: string | null;
  awayKitColour: string | null;
  homeShinPadWarningCount: number;
  awayShinPadWarningCount: number;
  prediction: ReturnType<typeof calculateFixtureWinChance> | null;
};

type PitchPage = {
  pitch: string;
  fixtures: PrintableFixture[];
  page: number;
  pages: number;
  totalFixtures: number;
};

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
  },
) {
  ctx.save();
  ctx.font = options?.font ?? font(10);
  ctx.fillStyle = options?.fill ?? "#111111";
  ctx.textAlign = options?.align ?? "left";
  ctx.textBaseline = "alphabetic";
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

function drawPageHeader(
  ctx: CanvasRenderingContext2D,
  input: {
    pitch: string;
    date: string;
    venue: string;
    fixtures: number;
    page: number;
    pages: number;
  },
) {
  ctx.fillStyle = "#07150f";
  ctx.fillRect(0, 0, WIDTH, HEADER);
  ctx.fillStyle = "#31e981";
  ctx.fillRect(0, HEADER - 5, WIDTH, 5);

  write(ctx, "SIXFL MATCH NIGHT", MARGIN, 19, {
    font: font(8.5, true),
    fill: "#31e981",
  });
  write(ctx, input.pitch, MARGIN, 42, {
    font: font(20, true),
    fill: "#ffffff",
  });
  write(ctx, input.date, MARGIN, 54, {
    font: font(7.5),
    fill: "#d9e6df",
  });

  write(
    ctx,
    input.pages > 1
      ? `${input.fixtures} fixtures - page ${input.page}/${input.pages}`
      : `${input.fixtures} fixtures`,
    WIDTH - MARGIN,
    20,
    {
      font: font(8, true),
      fill: "#ffffff",
      align: "right",
    },
  );
  write(ctx, fit(ctx, input.venue, 178), WIDTH - MARGIN, 38, {
    font: font(7.5),
    fill: "#d9e6df",
    align: "right",
  });
  write(ctx, "A5 tally and score sheet", WIDTH - MARGIN, 52, {
    font: font(7.5),
    fill: "#31e981",
    align: "right",
  });
}

function drawShirt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colour: string | null,
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + 3, y);
  ctx.lineTo(x + 7, y + 2);
  ctx.lineTo(x + 11, y);
  ctx.lineTo(x + 15, y + 4);
  ctx.lineTo(x + 12, y + 8);
  ctx.lineTo(x + 11, y + 6);
  ctx.lineTo(x + 11, y + 16);
  ctx.lineTo(x + 3, y + 16);
  ctx.lineTo(x + 3, y + 6);
  ctx.lineTo(x + 2, y + 8);
  ctx.lineTo(x - 1, y + 4);
  ctx.closePath();
  ctx.fillStyle = colour ?? "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  if (!colour) {
    write(ctx, "?", x + 7, y + 12, {
      font: font(7, true),
      fill: "#6b7280",
      align: "center",
    });
  }

  ctx.restore();
}

function drawTeamTallyRow(
  ctx: CanvasRenderingContext2D,
  input: {
    teamName: string;
    kitColour: string | null;
    warningCount: number;
    x: number;
    y: number;
    width: number;
  },
) {
  const rowHeight = 38;
  const teamWidth = 140;
  const scoreWidth = 42;
  const sectionGap = 7;
  const tallyX = input.x + teamWidth;
  const scoreX = input.x + input.width - scoreWidth;
  const tallyWidth = scoreX - sectionGap - tallyX;

  drawShirt(ctx, input.x + 2, input.y + 10, input.kitColour);
  ctx.font = font(8.6, true);
  write(
    ctx,
    fit(ctx, input.teamName, teamWidth - 27),
    input.x + 23,
    input.y + 14,
    { font: font(8.6, true) },
  );

  const warningBoxX = input.x + 23;
  const warningBoxY = input.y + 21;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 0.8;
  ctx.fillRect(warningBoxX, warningBoxY, 10, 10);
  ctx.strokeRect(warningBoxX, warningBoxY, 10, 10);

  const warningTextX = warningBoxX + 15;
  write(ctx, "SHIN PAD WARNING", warningTextX, warningBoxY + 4.5, {
    font: font(4.8, true),
    fill: "#555555",
  });
  write(
    ctx,
    `PREVIOUS WARNINGS: ${input.warningCount}`,
    warningTextX,
    warningBoxY + 10.5,
    {
      font: font(4.6, true),
      fill: input.warningCount > 0 ? "#9a3412" : "#6b7280",
    },
  );

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#7c8781";
  ctx.lineWidth = 0.8;
  ctx.fillRect(tallyX, input.y, tallyWidth, rowHeight);
  ctx.strokeRect(tallyX, input.y, tallyWidth, rowHeight);

  write(ctx, "TALLY", tallyX + 5, input.y + 8, {
    font: font(5.8, true),
    fill: "#8a938e",
  });

  ctx.strokeStyle = "#d7ddd9";
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(tallyX + 5, input.y + rowHeight / 2 + 4);
  ctx.lineTo(tallyX + tallyWidth - 5, input.y + rowHeight / 2 + 4);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 1.1;
  ctx.fillRect(scoreX, input.y, scoreWidth, rowHeight);
  ctx.strokeRect(scoreX, input.y, scoreWidth, rowHeight);

  write(ctx, "SCORE", scoreX + scoreWidth / 2, input.y + 9, {
    font: font(5.8, true),
    fill: "#555555",
    align: "center",
  });
}

function drawFixture(
  ctx: CanvasRenderingContext2D,
  fixture: PrintableFixture,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#bfc8c3";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = "#eff5f1";
  ctx.fillRect(x, y, width, 28);

  write(ctx, formatTimeInLondon(fixture.kickoffAt), x + 10, y + 19, {
    font: font(14, true),
  });

  if (fixture.isTv) {
    ctx.fillStyle = "#07150f";
    ctx.fillRect(x + width - 68, y + 5, 58, 18);
    write(ctx, "SIXFL TV", x + width - 39, y + 18, {
      font: font(7.5, true),
      fill: "#31e981",
      align: "center",
    });
  }

  const referee = fixture.referee?.name || fixture.referee?.email || "REFEREE NOT ASSIGNED";
  const competition = [fixture.league.name, fixture.division?.name]
    .filter(Boolean)
    .join(" / ");

  write(ctx, fit(ctx, `Referee: ${referee}`, width - 20), x + 10, y + 40, {
    font: font(8, true),
    fill: fixture.referee ? "#222222" : "#a00000",
  });
  write(ctx, fit(ctx, competition, width - 20), x + 10, y + 51, {
    font: font(6.7),
    fill: "#6b7280",
  });

  const rowX = x + 10;
  const rowWidth = width - 20;
  drawTeamTallyRow(ctx, {
    teamName: fixture.homeTeam.name,
    kitColour: fixture.homeKitColour,
    warningCount: fixture.homeShinPadWarningCount,
    x: rowX,
    y: y + 58,
    width: rowWidth,
  });
  drawTeamTallyRow(ctx, {
    teamName: fixture.awayTeam.name,
    kitColour: fixture.awayKitColour,
    warningCount: fixture.awayShinPadWarningCount,
    x: rowX,
    y: y + 101,
    width: rowWidth,
  });

  const aiY = y + Math.min(height - 7, 151);
  if (fixture.prediction) {
    const prediction = fixture.prediction;
    const aiLine = `AI: ${fixture.homeTeam.name} ${prediction.home}% | Draw ${prediction.draw}% | ${fixture.awayTeam.name} ${prediction.away}% | Predicted ${prediction.predictedResult.label}`;
    write(ctx, fit(ctx, aiLine, width - 20), x + 10, aiY, {
      font: font(6.5, true),
      fill: "#0b5b35",
    });
  } else {
    write(ctx, "AI prediction: unavailable", x + 10, aiY, {
      font: font(6.5),
      fill: "#777777",
    });
  }
}

function drawFooter(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "#c9d0cc";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(MARGIN, HEIGHT - FOOTER);
  ctx.lineTo(WIDTH - MARGIN, HEIGHT - FOOTER);
  ctx.stroke();

  write(ctx, "Use the tally areas during play, then enter the final score in the boxes.", MARGIN, HEIGHT - 4, {
    font: font(6.2),
    fill: "#666666",
  });
  write(ctx, "6-a-side. Done properly.", WIDTH - MARGIN, HEIGHT - 4, {
    font: font(6.2, true),
    fill: "#0b5b35",
    align: "right",
  });
}

function venueLabel(fixtures: PrintableFixture[]) {
  const venues = Array.from(
    new Set(
      fixtures
        .map((fixture) => cleanText(fixture.venue?.name || fixture.league.venueName))
        .filter(Boolean),
    ),
  );

  if (venues.length === 0) return "Venue not assigned";
  return venues.length === 1 ? venues[0] : `${venues.length} venues`;
}

function buildPitchPages(fixtures: PrintableFixture[]) {
  const byPitch = new Map<string, PrintableFixture[]>();

  for (const fixture of fixtures) {
    const pitch = cleanText(fixture.pitch) || "Pitch not assigned";
    byPitch.set(pitch, [...(byPitch.get(pitch) ?? []), fixture]);
  }

  if (byPitch.size === 0) byPitch.set("No fixtures", []);

  const pages: PitchPage[] = [];
  for (const [pitch, pitchFixtures] of Array.from(byPitch).sort(([left], [right]) =>
    left.localeCompare(right, "en", { numeric: true, sensitivity: "base" }),
  )) {
    pitchFixtures.sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime());
    const pitchPageCount = Math.max(1, Math.ceil(pitchFixtures.length / MAX_PER_PAGE));

    for (let page = 0; page < pitchPageCount; page += 1) {
      pages.push({
        pitch,
        fixtures: pitchFixtures.slice(page * MAX_PER_PAGE, (page + 1) * MAX_PER_PAGE),
        page: page + 1,
        pages: pitchPageCount,
        totalFixtures: pitchFixtures.length,
      });
    }
  }

  return pages;
}

function drawRasterPage(page: PitchPage, label: string) {
  const canvas = createCanvas(WIDTH * RASTER_SCALE, HEIGHT * RASTER_SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(RASTER_SCALE, RASTER_SCALE);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawPageHeader(ctx, {
    pitch: page.pitch,
    date: label,
    venue: venueLabel(page.fixtures),
    fixtures: page.totalFixtures,
    page: page.page,
    pages: page.pages,
  });

  if (page.fixtures.length === 0) {
    write(ctx, "No published fixtures were found for these Night Board filters.", MARGIN, 120, {
      font: font(11, true),
      fill: "#555555",
    });
    drawFooter(ctx);
    return canvas;
  }

  const top = HEADER + 9;
  const bottom = HEIGHT - FOOTER - 6;
  const cardHeight = Math.floor(
    (bottom - top - GAP * (page.fixtures.length - 1)) / page.fixtures.length,
  );

  page.fixtures.forEach((fixture, index) => {
    drawFixture(
      ctx,
      fixture,
      MARGIN,
      top + index * (cardHeight + GAP),
      WIDTH - MARGIN * 2,
      cardHeight,
    );
  });
  drawFooter(ctx);

  return canvas;
}

function createPdf(fixtures: PrintableFixture[], label: string) {
  ensureFontsRegistered();

  const pages = buildPitchPages(fixtures);
  const pdfCanvas = createCanvas(WIDTH, HEIGHT, "pdf");
  const pdfContext = pdfCanvas.getContext("2d");

  pages.forEach((page, index) => {
    if (index > 0) pdfContext.addPage(WIDTH, HEIGHT);
    const rasterPage = drawRasterPage(page, label);
    pdfContext.drawImage(rasterPage, 0, 0, WIDTH, HEIGHT);
  });

  return pdfCanvas.toBuffer("application/pdf", {
    title: `SIXFL pitch tally sheets - ${label}`,
    author: "SIXFL",
    subject: "A5 referee tally and score sheets",
    keywords: "SIXFL, fixtures, referee, score sheet, tally, goals, A5",
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
      division: { select: { name: true } },
      venue: { select: { name: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      referee: { select: { name: true, email: true } },
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
  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const leagueIds = Array.from(new Set(fixtures.map((fixture) => fixture.leagueId)));
  const teamIds = Array.from(
    new Set(fixtures.flatMap((fixture) => [fixture.homeTeam.id, fixture.awayTeam.id])),
  );

  const [history, tvRows, kitColours, shinPadWarningRows] = await Promise.all([
    leagueIds.length
      ? prisma.fixture.findMany({
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
      : Promise.resolve([]),
    fixtureIds.length
      ? prisma
          .$queryRaw<TvRow[]>(Prisma.sql`
            SELECT "id", "sixflTvRecorded"
            FROM "Fixture"
            WHERE "id" IN (${Prisma.join(fixtureIds)})
          `)
          .catch(() => [] as TvRow[])
      : Promise.resolve([] as TvRow[]),
    getTeamKitColours(teamIds),
    teamIds.length
      ? prisma
          .$queryRaw<ShinPadWarningCountRow[]>(Prisma.sql`
            SELECT
              warning."teamId" AS "teamId",
              COUNT(*)::int AS "warningCount"
            FROM "TeamShinPadWarning" warning
            WHERE warning."teamId" IN (${Prisma.join(teamIds)})
            GROUP BY warning."teamId"
          `)
          .catch(() => [] as ShinPadWarningCountRow[])
      : Promise.resolve([] as ShinPadWarningCountRow[]),
  ]);

  const historyByLeague = new Map<string, typeof history>();
  for (const fixture of history) {
    historyByLeague.set(fixture.leagueId, [
      ...(historyByLeague.get(fixture.leagueId) ?? []),
      fixture,
    ]);
  }

  const tvByFixture = new Map(tvRows.map((row) => [row.id, row.sixflTvRecorded]));
  const warningCountByTeam = new Map(
    shinPadWarningRows.map((row) => [row.teamId, row.warningCount]),
  );
  const printable: PrintableFixture[] = fixtures.map((fixture) => ({
    ...fixture,
    isTv: tvByFixture.get(fixture.id) ?? false,
    homeKitColour: kitColours.get(fixture.homeTeam.id) ?? null,
    awayKitColour: kitColours.get(fixture.awayTeam.id) ?? null,
    homeShinPadWarningCount: warningCountByTeam.get(fixture.homeTeam.id) ?? 0,
    awayShinPadWarningCount: warningCountByTeam.get(fixture.awayTeam.id) ?? 0,
    prediction:
      fixture.status === FixtureStatus.SCHEDULED
        ? calculateFixtureWinChance({
            homeTeamId: fixture.homeTeam.id,
            awayTeamId: fixture.awayTeam.id,
            fixtures: historyByLeague.get(fixture.leagueId) ?? [],
          })
        : null,
  }));

  const pdf = createPdf(printable, dateLabel(start));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="sixfl-pitch-tally-sheets-${date}.pdf"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
