const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patch(file, replacements) {
  const absolute = path.join(root, file);
  let source = fs.readFileSync(absolute, "utf8");
  for (const [before, after, label] of replacements) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      throw new Error(`Could not apply ${label} in ${file}`);
    }
    source = source.replace(before, after);
  }
  fs.writeFileSync(absolute, source, "utf8");
}

patch("prisma/schema.prisma", [
  [
    '  awayMatchFeePence   Int?\n\n  round',
    '  awayMatchFeePence   Int?\n  sixflTvRecorded      Boolean @default(false)\n  sixflTvUrl           String?\n\n  round',
    "fixture SIXFL TV schema fields",
  ],
]);

// Captain fixtures now render their SIXFL TV badges directly in the committed
// React page. Do not rewrite that page during prebuild.
patch("src/app/player/team/[teamid]/page.tsx", [
  [
    'import { authOptions } from "@/auth";\n',
    'import { authOptions } from "@/auth";\nimport SixflTvFixtureBadge from "@/components/sixfl-tv/SixflTvFixtureBadge";\n',
    "player badge import",
  ],
  [
    '        pitch: true,\n        homeTeamId: true,',
    '        pitch: true,\n        sixflTvRecorded: true,\n        sixflTvUrl: true,\n        homeTeamId: true,',
    "player upcoming tv fields",
  ],
  [
    '                          <div className="font-semibold text-white">\n                            {getFixtureLabel({ homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name })}\n                          </div>',
    '                          <div className="flex flex-wrap items-center gap-2">\n                            <div className="font-semibold text-white">\n                              {getFixtureLabel({ homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name })}\n                            </div>\n                            <SixflTvFixtureBadge\n                              recorded={fixture.sixflTvRecorded}\n                              url={fixture.sixflTvUrl}\n                            />\n                          </div>',
    "player upcoming fixture badges",
  ],
]);

console.log("Captain SIXFL TV badges are native; player fixture compatibility remains applied.");
