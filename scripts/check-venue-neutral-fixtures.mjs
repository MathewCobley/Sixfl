import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const division = read("src/app/(admin)/admin/fixtures/generate/division-actions.ts");
const nextWeek = read("src/app/api/admin/fixtures/generate-next-week/route.ts");
const matchupApi = read("src/app/api/admin/fixtures/matchup-grid/route.ts");
const matchupUi = read("src/components/admin/fixtures/FixtureMatchupGrid.tsx");
const generatorPage = read("src/app/(admin)/admin/fixtures/generate/page.tsx");

expect(
  division.includes("function repeatRounds(") &&
    !division.includes("function mirrorRounds(") &&
    !division.includes("isEvenRound") &&
    division.includes('COALESCE(t."isFixturePlaceholder", false) = false'),
  "division fixture generation must repeat pairings without reversing home/away direction and must exclude placeholders",
);

expect(
  division.includes("homeEarliest") && division.includes("awayEarliest") &&
    division.includes("homeLatest") && division.includes("awayLatest"),
  "venue-neutral scheduling must preserve current earliest/latest kick-off enforcement",
);

expect(
  nextWeek.includes("team1Id: string") &&
    nextWeek.includes("team2Id: string") &&
    !nextWeek.includes("homeCounts") &&
    !nextWeek.includes("awayCounts") &&
    nextWeek.includes("LeagueSeasonTeam") &&
    nextWeek.includes('COALESCE(t."isFixturePlaceholder", false) = false') &&
    nextWeek.includes("activeDivisionRows") &&
    nextWeek.includes("refreshStoredAiPreviewsForLeague") &&
    nextWeek.includes("snapshotFixtureMatchFees"),
  "one-week generation must be venue-neutral while preserving active-season, fee and AI-prediction safeguards",
);

expect(
  matchupApi.includes("meetingCount: number") &&
    !/homeCount|awayCount|totalCount/.test(matchupApi) &&
    matchupApi.includes("singleMeetingPairs") &&
    matchupApi.includes("twoMeetingPairs"),
  "matchup API must count meetings rather than home/away direction",
);

expect(
  matchupUi.includes("meetingCount: number") &&
    !/homeCount|awayCount|totalCount|Both ways|One way only|reverse fixture/.test(matchupUi) &&
    matchupUi.includes("Met twice or more") &&
    matchupUi.includes("Met once") &&
    matchupUi.includes('label="Team fee"'),
  "matchup UI must use venue-neutral coverage and fee wording",
);

expect(
  generatorPage.includes("SIXFL has no home/away significance") &&
    !generatorPage.includes("home/away order reversed"),
  "full schedule generator copy must explain repeat meetings without home/away language",
);

if (failures.length) {
  console.error("\nVENUE-NEUTRAL FIXTURE CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error("\nDo not merge until fixture scheduling and matchup coverage are directionless.\n");
  process.exit(1);
}

console.log("Venue-neutral fixture scheduling contract passed.");
