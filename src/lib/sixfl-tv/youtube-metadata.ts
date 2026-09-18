export type SixflTvYoutubeMetadataKind = "HIGHLIGHTS" | "FULL_MATCH";

export type SixflTvYoutubeMetadataFixture = {
  kickoffAt: Date;
  league: { name: string; season?: string | null };
  homeTeam: { name: string };
  awayTeam: { name: string };
  result?: { homeScore: number; awayScore: number } | null;
};

export function sixflTvYoutubeDefaults(
  fixture: SixflTvYoutubeMetadataFixture,
  kind: SixflTvYoutubeMetadataKind,
) {
  const videoLabel = kind === "HIGHLIGHTS" ? "Match Highlights" : "Full Match";
  const shortDate = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(fixture.kickoffAt).replace("Sept", "Sep");
  const fullDate = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(fixture.kickoffAt);

  const scoreline = fixture.result
    ? `${fixture.homeTeam.name} ${fixture.result.homeScore}–${fixture.result.awayScore} ${fixture.awayTeam.name}`
    : `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`;
  const leagueLabel = [fixture.league.name, fixture.league.season].filter(Boolean).join(" · ");

  return {
    title: `${scoreline} | ${videoLabel} | ${shortDate} | SIXFL`,
    description: [
      scoreline,
      videoLabel,
      "",
      `League: ${leagueLabel}`,
      `Match date: ${fullDate}`,
      "",
      "Goal of the Month: https://sixfl.co.uk/goal-of-the-month",
      "SIXFL: https://sixfl.co.uk",
    ].join("\n"),
  };
}
