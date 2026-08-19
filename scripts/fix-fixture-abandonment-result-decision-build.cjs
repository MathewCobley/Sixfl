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
console.log("Hardened abandoned-match official result build and email wording.");
