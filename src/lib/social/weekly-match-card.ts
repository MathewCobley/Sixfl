// ========================================
// File: src/lib/social/weekly-match-card.ts
// ========================================

import { SocialPostType } from "@prisma/client";
import { formatDateTimeInLondon, formatTimeInLondon } from "@/lib/datetime/london";

export type WeeklySocialPostType = Extract<
  SocialPostType,
  "FIXTURE" | "RESULT" | "UPDATE"
>;

export type WeeklyMatchCardFixture = {
  id: string;
  kickoffAt: Date;
  pitch: string | null;
  status: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
};

export function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function getWeeklyMatchCardImageUrl(cardId: string) {
  return `${getBaseUrl()}/api/social/match-card/${cardId}`;
}

export function formatWeeklyCardDate(value: Date | string) {
  return formatDateTimeInLondon(value, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatWeeklyCardShortDate(value: Date | string) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function getWeeklyPostTypeLabel(postType: SocialPostType | string) {
  switch (postType) {
    case "RESULT":
      return "Results card";
    case "UPDATE":
      return "Update card";
    case "FIXTURE":
    default:
      return "Match card";
  }
}

export function normaliseSocialText(value: string) {
  return value
    .replaceAll("’", "'")
    .replaceAll("‘", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("•", "-")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFixtureLine(input: {
  fixture: WeeklyMatchCardFixture;
  postType: WeeklySocialPostType;
}) {
  const time = formatTimeInLondon(input.fixture.kickoffAt);
  const pitch = input.fixture.pitch ? ` - ${input.fixture.pitch}` : "";

  if (
    input.postType === "RESULT" &&
    input.fixture.homeScore !== null &&
    input.fixture.awayScore !== null
  ) {
    return `${input.fixture.homeTeamName} ${input.fixture.homeScore}-${input.fixture.awayScore} ${input.fixture.awayTeamName}`;
  }

  if (input.postType === "UPDATE") {
    const status = input.fixture.status.toLowerCase();
    return `${time}${pitch} - ${input.fixture.homeTeamName} v ${input.fixture.awayTeamName} (${status})`;
  }

  return `${time}${pitch} - ${input.fixture.homeTeamName} v ${input.fixture.awayTeamName}`;
}

export function buildWeeklyMatchCardCaption(input: {
  postType: WeeklySocialPostType;
  leagueName: string;
  fixtureDate: Date;
  fixtures: WeeklyMatchCardFixture[];
}) {
  const dateLabel = formatWeeklyCardDate(input.fixtureDate);
  const heading =
    input.postType === "RESULT"
      ? `${input.leagueName} results - ${dateLabel}`
      : input.postType === "UPDATE"
        ? `${input.leagueName} fixture update - ${dateLabel}`
        : `${input.leagueName} fixtures - ${dateLabel}`;

  const lines = input.fixtures
    .slice(0, 10)
    .map((fixture) => buildFixtureLine({ fixture, postType: input.postType }));

  const suffix =
    input.fixtures.length > 10
      ? [`+ ${input.fixtures.length - 10} more fixtures on the night.`]
      : [];

  return normaliseSocialText(
    [
      heading,
      "",
      ...lines,
      ...suffix,
      "",
      "6-a-side football. Done properly.",
      "#SIXFL #SixASideFootball #GrassrootsFootball",
    ].join("\n"),
  );
}
