// ========================================
// File: src/app/api/admin/night-board/pitch-sheets/route.ts
// ========================================

import { FixtureStatus, Prisma } from "@prisma/client";
import { createCanvas, type CanvasRenderingContext2D } from "canvas";

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

const WIDTH = 420;
const HEIGHT = 595;
const MARGIN = 22;
const HEADER = 74;
const FOOTER = 18;
const GAP = 8;
const MAX_PER_PAGE = 5;
const VISIBLE_STATUSES = [FixtureStatus.SCHEDULED, FixtureStatus.COMPLETED] as const;

type TvRow = { id: string; sixflTvRecorded: boolean };
type FixtureRow = Awaited<ReturnType<typeof getFixtures>>[number];
type PrintableFixture = FixtureRow & {
  isTv: boolean;
  prediction: ReturnType<typeof calculateFixtureWinChance> | null;
};

function text(value: unknown) {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function validDate(value: string | null) {
  const date = text(value);
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
  return text(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(value),
  );
}

function fit(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const clean = text(value);
  if (ctx.measureText(clean).width <= maxWidth) return clean;
  let output = clean;
  while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output.trim()}...`;
}

function write(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  options?: { font?: string; fill?: string; align?: CanvasTextAlign },
) {
  ctx.save();
  ctx.font = options?.font ?? "10px Helvetica";
  ctx.fillStyle = options?.fill ?? "#111111";
  ctx.textAlign = options?.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text(value), x, y);
  ctx.restore();
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
  write(ctx, "SIXFL MATCH NIGHT", MARGIN, 23, { font: "bold 9px Helvetica", fill: "#31e981" });
  write(ctx, input.pitch, MARGIN, 48, { font: "bold 22px Helvetica", fill: "#ffffff" });
  write(ctx, input.date, MARGIN, 65, { font: "9px Helvetica", fill: "#d9e6df" });
  write(
    ctx,
    input.pages > 1
      ? `${input.fixtures} fixtures - page ${input.page}/${input.pages}`
      : `${input.fixtures} fixtures`,
    WIDTH - MARGIN,
    26,
    { font: "bold 8px Helvetica", fill: "#ffffff", align: "right" },
  );
  write(ctx, fit(ctx, input.venue, 175), WIDTH - MARGIN, 47, {
    font: "8px Helvetica",
    fill: "#d9e6df",
    align: "right",
  });
  write(ctx, "A5 referee score sheet", WIDTH - MARGIN, 64, {
    font: "8px Helvetica",
    fill: "#31e981",
    align: "right",
  });
}

function drawResultBoxes(ctx: CanvasRenderingContext2D, fixture: PrintableFixture, x: number, y: number, width: number) {
  const right = x + width - (fixture.isTv ? 82 : 10);
  const boxWidth = 28;
  const awayX = right - boxWidth;
  const homeX = awayX - boxWidth - 10;
  write(ctx, "RESULT", homeX - 38, y + 16, { font: "bold 6.5px Helvetica", fill: "#555555" });
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 0.8;
  for (const boxX of [homeX, awayX]) {
    ctx.fillRect(boxX, y + 4, boxWidth, 17);
    ctx.strokeRect(boxX, y + 4, boxWidth, 17);
  }
  write(ctx, fixture.result ? String(fixture.result.homeScore) : "", homeX + boxWidth / 2, y + 17, {
    font: "bold 11px Helvetica",
    align: "center",
  });
  write(ctx, "-", homeX + boxWidth + 5, y + 17, { font: "bold 10px Helvetica", align: "center" });
  write(ctx, fixture.result ? String(fixture.result.awayScore) : "", awayX + boxWidth / 2, y + 17, {
    font: "bold 11px Helvetica",
    align: "center",
  });
}

function drawFixture(ctx: CanvasRenderingContext2D, fixture: PrintableFixture, x: number, y: number, width: number, height: number) {
  const compact = height < 110;
  const maxWidth = width - 20;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#bfc8c3";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#eff5f1";
  ctx.fillRect(x, y, width, 25);

  write(ctx, formatTimeInLondon(fixture.kickoffAt), x + 10, y + 17, { font: "bold 14px Helvetica" });
  drawResultBoxes(ctx, fixture, x, y, width);
  if (fixture.isTv) {
    ctx.fillStyle = "#07150f";
    ctx.fillRect(x + width - 72, y + 5, 62, 16);
    write(ctx, "SIXFL TV", x + width - 41, y + 17, {
      font: "bold 8px Helvetica",
      fill: "#31e981",
      align: "center",
    });
  }

  write(ctx, fit(ctx, `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`, maxWidth), x + 10, y + (compact ? 42 : 45), {
    font: compact ? "bold 11px Helvetica" : "bold 13px Helvetica",
  });
  const referee = fixture.referee?.name || fixture.referee?.email || "REFEREE NOT ASSIGNED";
  write(ctx, fit(ctx, `Referee: ${referee}`, maxWidth), x + 10, y + (compact ? 56 : 61), {
    font: compact ? "8px Helvetica" : "9px Helvetica",
    fill: fixture.referee ? "#333333" : "#a00000",
  });

  if (!compact) {
    const competition = [fixture.league.name, fixture.division?.name].filter(Boolean).join(" / ");
    write(ctx, fit(ctx, competition, maxWidth), x + 10, y + 75, {
      font: "8px Helvetica",
      fill: "#666666",
    });
  }

  const aiY = y + (compact ? 70 : 89);
  if (!fixture.prediction) {
    write(ctx, "AI prediction: unavailable", x + 10, aiY, { font: "8px Helvetica", fill: "#777777" });
    return;
  }

  const p = fixture.prediction;
  const aiLine = compact
    ? `AI: ${p.home}% / ${p.draw}% / ${p.away}% - predicted ${p.predictedResult.label}`
    : `AI: ${fixture.homeTeam.name} ${p.home}% | Draw ${p.draw}% | ${fixture.awayTeam.name} ${p.away}%`;
  write(ctx, fit(ctx, aiLine, maxWidth), x + 10, aiY, {
    font: "bold 7.5px Helvetica",
    fill: "#0b5b35",
  });
  if (!compact) {
    write(ctx, `Predicted score: ${p.predictedResult.label} (${p.confidence} confidence)`, x + 10, aiY + 12, {
      font: "8px Helvetica",
      fill: "#333333",
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
  write(ctx, "Record the final score clearly, then enter it in SIXFL.", MARGIN, HEIGHT - 6, {
    font: "7px Helvetica",
    fill: "#666666",
  });
  write(ctx, "6-a-side. Done properly.", WIDTH - MARGIN, HEIGHT - 6, {
    font: "bold 7px Helvetica",
    fill: "#0b5b35",
    align: "right",
  });
}

function venueLabel(fixtures: PrintableFixture[]) {
  const venues = Array.from(
    new Set(fixtures.map((fixture) => text(fixture.venue?.name || fixture.league.venueName)).filter(Boolean)),
  );
  if (venues.length === 0) return "Venue not assigned";
  return venues.length === 1 ? venues[0] : `${venues.length} venues`;
}

function createPdf(fixtures: PrintableFixture[], label: string) {
  const canvas = createCanvas(WIDTH, HEIGHT, "pdf");
  const ctx = canvas.getContext("2d");
  const byPitch = new Map<string, PrintableFixture[]>();
  for (const fixture of fixtures) {
    const pitch = text(fixture.pitch) || "Pitch not assigned";
    byPitch.set(pitch, [...(byPitch.get(pitch) ?? []), fixture]);
  }
  if (byPitch.size === 0) byPitch.set("No fixtures", []);

  let first = true;
  for (const [pitch, pitchFixtures] of Array.from(byPitch).sort(([a], [b]) =>
    a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
  )) {
    pitchFixtures.sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
    const pages = Math.max(1, Math.ceil(pitchFixtures.length / MAX_PER_PAGE));
    for (let page = 0; page < pages; page += 1) {
      if (!first) ctx.addPage(WIDTH, HEIGHT);
      first = false;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const pageFixtures = pitchFixtures.slice(page * MAX_PER_PAGE, (page + 1) * MAX_PER_PAGE);
      drawPageHeader(ctx, {
        pitch,
        date: label,
        venue: venueLabel(pageFixtures),
        fixtures: pitchFixtures.length,
        page: page + 1,
        pages,
      });
      if (pageFixtures.length === 0) {
        write(ctx, "No published fixtures were found for these Night Board filters.", MARGIN, 130, {
          font: "bold 12px Helvetica",
          fill: "#555555",
        });
        drawFooter(ctx);
        continue;
      }
      const top = HEADER + 14;
      const bottom = HEIGHT - FOOTER - 8;
      const cardHeight = Math.floor((bottom - top - GAP * (pageFixtures.length - 1)) / pageFixtures.length);
      pageFixtures.forEach((fixture, index) =>
        drawFixture(ctx, fixture, MARGIN, top + index * (cardHeight + GAP), WIDTH - MARGIN * 2, cardHeight),
      );
      drawFooter(ctx);
    }
  }

  return canvas.toBuffer("application/pdf", {
    title: `SIXFL pitch sheets - ${label}`,
    author: "SIXFL",
    subject: "A5 referee score sheets",
    keywords: "SIXFL, fixtures, referee, score sheet, A5",
    creationDate: new Date(),
  });
}

async function getFixtures(input: { start: Date; end: Date; leagueId: string; venueId: string }) {
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
  const leagueId = text(url.searchParams.get("leagueId"));
  const venueId = text(url.searchParams.get("venueId"));
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

  const [history, tvRows] = await Promise.all([
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
  ]);

  const historyByLeague = new Map<string, typeof history>();
  for (const fixture of history) {
    historyByLeague.set(fixture.leagueId, [...(historyByLeague.get(fixture.leagueId) ?? []), fixture]);
  }
  const tvByFixture = new Map(tvRows.map((row) => [row.id, row.sixflTvRecorded]));
  const printable: PrintableFixture[] = fixtures.map((fixture) => ({
    ...fixture,
    isTv: tvByFixture.get(fixture.id) ?? false,
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
      "Content-Disposition": `inline; filename="sixfl-pitch-sheets-${date}.pdf"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
