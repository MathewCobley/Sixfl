// File: src/lib/fixturePresentation.ts

export type FixturePresentationMode = "captain" | "admin" | "neutral";

type TeamLike = {
  id: string;
  name: string;
};

type ResultLike = {
  homeScore: number;
  awayScore: number;
};

export type PresentFixtureInput = {
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: TeamLike;
  awayTeam: TeamLike;
  result?: ResultLike | null;
};

export type PresentedFixture = {
  mode: FixturePresentationMode;
  hasPerspective: boolean;
  isFocusTeamHome: boolean | null;
  teamA: TeamLike;
  teamB: TeamLike;
  focusTeam: TeamLike | null;
  opponentTeam: TeamLike | null;
  labels: {
    teamA: string;
    teamB: string;
    scoreA: string;
    scoreB: string;
  };
  scores: {
    teamA: number | null;
    teamB: number | null;
  };
  matchupText: string;
  compactMatchupText: string;
  resultText: string | null;
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toResultText(teamAScore: number | null, teamBScore: number | null): string | null {
  if (!isNumber(teamAScore) || !isNumber(teamBScore)) {
    return null;
  }

  return `${teamAScore}-${teamBScore}`;
}

export function presentFixture(
  fixture: PresentFixtureInput,
  options: {
    mode: FixturePresentationMode;
    focusTeamId?: string | null;
  },
): PresentedFixture {
  const { mode, focusTeamId } = options;

  const focusIsHome = Boolean(focusTeamId && focusTeamId === fixture.homeTeamId);
  const focusIsAway = Boolean(focusTeamId && focusTeamId === fixture.awayTeamId);
  const hasCaptainPerspective = mode === "captain" && (focusIsHome || focusIsAway);

  const homeScore = fixture.result?.homeScore ?? null;
  const awayScore = fixture.result?.awayScore ?? null;

  if (hasCaptainPerspective) {
    const focusTeam = focusIsHome ? fixture.homeTeam : fixture.awayTeam;
    const opponentTeam = focusIsHome ? fixture.awayTeam : fixture.homeTeam;

    const focusScore = focusIsHome ? homeScore : awayScore;
    const opponentScore = focusIsHome ? awayScore : homeScore;

    return {
      mode,
      hasPerspective: true,
      isFocusTeamHome: focusIsHome,
      teamA: focusTeam,
      teamB: opponentTeam,
      focusTeam,
      opponentTeam,
      labels: {
        teamA: "Your team",
        teamB: "Opponent",
        scoreA: "Your score",
        scoreB: "Opponent score",
      },
      scores: {
        teamA: focusScore,
        teamB: opponentScore,
      },
      matchupText: `${focusTeam.name} vs ${opponentTeam.name}`,
      compactMatchupText: `vs ${opponentTeam.name}`,
      resultText: toResultText(focusScore, opponentScore),
    };
  }

  return {
    mode,
    hasPerspective: false,
    isFocusTeamHome: null,
    teamA: fixture.homeTeam,
    teamB: fixture.awayTeam,
    focusTeam: null,
    opponentTeam: null,
    labels: {
      teamA: "Team A",
      teamB: "Team B",
      scoreA: "Team A score",
      scoreB: "Team B score",
    },
    scores: {
      teamA: homeScore,
      teamB: awayScore,
    },
    matchupText: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
    compactMatchupText: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
    resultText: toResultText(homeScore, awayScore),
  };
}