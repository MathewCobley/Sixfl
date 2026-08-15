const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/lib/fixtures/storedAiPredictions.ts",
);

let source = fs.readFileSync(filePath, "utf8");

const before = [
  "      kickoffAt: true,",
  "      status: true,",
  "      homeTeam: { select: { id: true, name: true } },",
].join("\n");
const after = [
  "      kickoffAt: true,",
  "      status: true,",
  "      publishedAt: true,",
  "      homeTeam: { select: { id: true, name: true } },",
].join("\n");

source = source.replaceAll(before, after);

if (!source.includes("if (fixture.status !== \"SCHEDULED\" || !fixture.publishedAt) continue;")) {
  throw new Error("Published-fixture AI prediction loop guard is missing.");
}

const leagueRefreshStart = source.indexOf(
  "export async function refreshStoredAiPreviewsForLeague",
);
if (leagueRefreshStart < 0) {
  throw new Error("League AI prediction refresh function was not found.");
}
const leagueRefreshSource = source.slice(leagueRefreshStart);
if (!leagueRefreshSource.includes("publishedAt: true,")) {
  throw new Error("League AI prediction refresh is missing publishedAt.");
}

fs.writeFileSync(filePath, source, "utf8");
console.log("Verified publishedAt is selected by all AI prediction refresh paths.");
