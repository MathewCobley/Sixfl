// ========================================
// File: src/app/api/social/match-card/[cardId]/route.ts
// ========================================

import sharp from "sharp";
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

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fitText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
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
      .join(" • "),
  };
}

function renderRows(fixtures: FixtureRow[], postType: SocialPostType) {
  const visibleFixtures = fixtures.slice(0, 8);
  const startY = 430;
  const rowGap = 96;

  const rows = visibleFixtures
    .map((fixture, index) => {
      const y = startY + index * rowGap;
      const line = getFixtureLine(fixture, postType);
      const statusBadge =
        fixture.status === "POSTPONED" || fixture.status === "CANCELLED"
          ? `<text x="938" y="${y + 31}" text-anchor="end" fill="#FDE68A" font-size="20" font-weight="800" letter-spacing="1.5">${escapeXml(fixture.status)}</text>`
          : "";

      return `
        <g>
          <rect x="90" y="${y}" width="900" height="74" rx="24" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.12)"/>
          <text x="126" y="${y + 31}" fill="#94A3B8" font-size="20" font-weight="700">${escapeXml(line.meta || "SIXFL")}</text>
          ${statusBadge}
          <text x="126" y="${y + 58}" fill="#FFFFFF" font-size="28" font-weight="850">${escapeXml(fitText(line.left, 22))}</text>
          <text x="540" y="${y + 58}" text-anchor="middle" fill="#34D399" font-size="32" font-weight="900">${escapeXml(line.middle)}</text>
          <text x="954" y="${y + 58}" text-anchor="end" fill="#FFFFFF" font-size="28" font-weight="850">${escapeXml(fitText(line.right, 22))}</text>
        </g>`;
    })
    .join("\n");

  const extra =
    fixtures.length > visibleFixtures.length
      ? `<text x="540" y="${startY + visibleFixtures.length * rowGap + 28}" text-anchor="middle" fill="#A7F3D0" font-size="24" font-weight="800">+ ${fixtures.length - visibleFixtures.length} more fixtures</text>`
      : "";

  return `${rows}${extra}`;
}

function buildSvg(card: CardRow, fixtures: FixtureRow[]) {
  const title = getTitle(card.postType);
  const subtitle = getSubtitle(card.postType);
  const dateLabel = formatWeeklyCardDate(card.fixtureDate);
  const shortDateLabel = formatWeeklyCardShortDate(card.fixtureDate).toUpperCase();
  const leagueLabel = card.season
    ? `${card.leagueName} • ${card.season}`
    : card.leagueName;

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="topGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(540 0) rotate(90) scale(760 760)">
          <stop stop-color="#10B981" stop-opacity="0.38"/>
          <stop offset="1" stop-color="#020617" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="panel" x1="90" y1="250" x2="990" y2="1120" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0F172A" stop-opacity="0.96"/>
          <stop offset="1" stop-color="#020617" stop-opacity="0.98"/>
        </linearGradient>
      </defs>

      <rect width="${WIDTH}" height="${HEIGHT}" fill="#020617"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#topGlow)"/>
      <circle cx="118" cy="160" r="230" fill="#10B981" opacity="0.09"/>
      <circle cx="954" cy="1236" r="300" fill="#34D399" opacity="0.08"/>

      <rect x="54" y="54" width="972" height="1242" rx="54" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.12)"/>
      <rect x="90" y="250" width="900" height="900" rx="44" fill="url(#panel)" stroke="rgba(255,255,255,0.12)"/>

      <text x="90" y="128" fill="#34D399" font-size="30" font-weight="900" letter-spacing="6">SIXFL</text>
      <text x="990" y="128" text-anchor="end" fill="#A7F3D0" font-size="20" font-weight="800" letter-spacing="3">${escapeXml(shortDateLabel)}</text>

      <text x="90" y="206" fill="#FFFFFF" font-size="74" font-weight="950" letter-spacing="-3">${escapeXml(title)}</text>
      <text x="94" y="250" fill="#94A3B8" font-size="28" font-weight="700">${escapeXml(subtitle)}</text>

      <text x="540" y="330" text-anchor="middle" fill="#A7F3D0" font-size="25" font-weight="850" letter-spacing="1.5">${escapeXml(fitText(leagueLabel, 54).toUpperCase())}</text>
      <text x="540" y="372" text-anchor="middle" fill="#F8FAFC" font-size="32" font-weight="900">${escapeXml(dateLabel)}</text>

      ${renderRows(fixtures, card.postType)}

      <rect x="90" y="1186" width="900" height="70" rx="26" fill="rgba(16,185,129,0.14)" stroke="rgba(52,211,153,0.24)"/>
      <text x="540" y="1229" text-anchor="middle" fill="#D1FAE5" font-size="28" font-weight="900">6-a-side football. Done properly.</text>
      <text x="540" y="1288" text-anchor="middle" fill="#64748B" font-size="20" font-weight="750">sixfl.co.uk</text>
    </svg>`;
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

  const svg = buildSvg(card, fixtures);
  const output = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(new Uint8Array(output), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
