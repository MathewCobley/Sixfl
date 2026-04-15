// ========================================
// File: src/lib/social/fixture-social.ts
// ========================================

import { FixtureStatus, SocialPostType } from "@prisma/client";

export function getFixtureSocialPostType(input: {
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
}) {
  if (input.status === "COMPLETED") {
    if (input.homeScore === null || input.awayScore === null) {
      throw new Error(
        "Completed fixtures need a saved result before creating a social draft.",
      );
    }

    return SocialPostType.RESULT;
  }

  if (input.status === "SCHEDULED") {
    return SocialPostType.FIXTURE;
  }

  if (input.status === "POSTPONED" || input.status === "CANCELLED") {
    return SocialPostType.UPDATE;
  }

  return SocialPostType.NONE;
}

export function formatFixtureSocialKickoff(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(date);
}

export function buildFixtureSocialCaption(input: {
  postType: SocialPostType;
  leagueName: string;
  venueName: string | null;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: Date;
  homeScore: number | null;
  awayScore: number | null;
  status: FixtureStatus;
}) {
  const kickoffLabel = formatFixtureSocialKickoff(input.kickoffAt);

  if (input.postType === SocialPostType.RESULT) {
    const venuePrefix = input.venueName ? ` at ${input.venueName}` : "";
    return `Full-time${venuePrefix}. ${input.homeTeamName} ${input.homeScore}-${input.awayScore} ${input.awayTeamName}. ${input.leagueName}. #SIXFL`;
  }

  if (input.postType === SocialPostType.FIXTURE) {
    const venueLabel = input.venueName ? ` at ${input.venueName}` : "";
    return `${input.homeTeamName} vs ${input.awayTeamName}. ${kickoffLabel}${venueLabel}. ${input.leagueName}. #SIXFL`;
  }

  if (input.postType === SocialPostType.UPDATE) {
    const venueLabel = input.venueName ? ` at ${input.venueName}` : "";
    const updateWord =
      input.status === "POSTPONED" ? "postponed" : "cancelled";
    return `${input.homeTeamName} vs ${input.awayTeamName}${venueLabel} has been ${updateWord}. ${input.leagueName}. #SIXFL`;
  }

  return `${input.homeTeamName} vs ${input.awayTeamName}. ${input.leagueName}. #SIXFL`;
}