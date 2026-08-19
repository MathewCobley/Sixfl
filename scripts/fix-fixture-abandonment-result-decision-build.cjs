const fs = require("node:fs");
const path = require("node:path");

const servicePath = path.join(process.cwd(), "src", "lib", "fixtures", "abandonment.ts");
let source = fs.readFileSync(servicePath, "utf8");

source = source
  .replace("          homeScore: awardedHomeScore,", "          homeScore: awardedHomeScore ?? 0,")
  .replace("          awayScore: awardedAwayScore,", "          awayScore: awardedAwayScore ?? 0,")
  .replaceAll(
    '      "The league/result outcome is separate and will be decided by SIXFL after reviewing the abandonment.",',
    "      officialResultLine,",
  )
  .replaceAll(
    '          "The league/result outcome will also be decided by SIXFL after review.",',
    "          officialResultLine,",
  );

fs.writeFileSync(servicePath, source, "utf8");

const pagePath = path.join(process.cwd(), "src", "app", "(public)", "referee", "night", "[id]", "page.tsx");
let page = fs.readFileSync(pagePath, "utf8");
page = page.replace(
  '{abandonment ? "Match abandoned · result to be decided by SIXFL" : fixture.result ? `Current result: ${fixture.result.homeScore}-${fixture.result.awayScore}${fixture.result.isDisputed ? " · disputed" : ""}` : "No result entered"}',
  '{abandonment ? abandonment.awardedHomeScore !== null && abandonment.awardedAwayScore !== null ? `Match abandoned · official result ${abandonment.awardedHomeScore}-${abandonment.awardedAwayScore}` : "Match abandoned · result to be decided by SIXFL" : fixture.result ? `Current result: ${fixture.result.homeScore}-${fixture.result.awayScore}${fixture.result.isDisputed ? " · disputed" : ""}` : "No result entered"}',
);
fs.writeFileSync(pagePath, page, "utf8");

console.log("Hardened abandoned-match official result build, email wording and referee display.");
