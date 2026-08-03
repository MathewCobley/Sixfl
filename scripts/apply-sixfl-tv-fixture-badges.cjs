const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function write(file, source) {
  fs.writeFileSync(path.join(root, file), source, "utf8");
}

function replaceRequired(file, source, beforeOptions, after, label) {
  if (source.includes(after)) return source;

  const options = Array.isArray(beforeOptions) ? beforeOptions : [beforeOptions];
  const before = options.find((candidate) => source.includes(candidate));
  if (!before) {
    throw new Error(`Could not apply ${label} in ${file}`);
  }

  return source.replace(before, after);
}

const schemaPath = "prisma/schema.prisma";
let schema = read(schemaPath);
schema = replaceRequired(
  schemaPath,
  schema,
  '  awayMatchFeePence   Int?\n\n  round',
  '  awayMatchFeePence   Int?\n  sixflTvRecorded      Boolean @default(false)\n  sixflTvUrl           String?\n\n  round',
  "fixture SIXFL TV schema fields",
);
write(schemaPath, schema);

const captainPath = "src/app/captain/team/[teamid]/fixtures/page.tsx";
let captain = read(captainPath);
captain = replaceRequired(
  captainPath,
  captain,
  'import TeamShirt from "@/components/fixtures/TeamShirt";\n',
  'import TeamShirt from "@/components/fixtures/TeamShirt";\nimport SixflTvFixtureBadge from "@/components/sixfl-tv/SixflTvFixtureBadge";\n',
  "captain badge import",
);
captain = replaceRequired(
  captainPath,
  captain,
  '            </h2>\n            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">',
  '            </h2>\n            {selectedFixture ? (\n              <div className="mt-3">\n                <SixflTvFixtureBadge\n                  recorded={selectedFixture.sixflTvRecorded}\n                  url={selectedFixture.sixflTvUrl}\n                />\n              </div>\n            ) : null}\n            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">',
  "captain selected fixture badge",
);

const oldUpcomingAnchor =
  '                        {isSelected ? (\n                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">Selected</span>\n                        ) : index === 0 ? (';
const nativeUpcomingAnchor =
  '                        </div>\n                        {isNextUpcoming ? (';
const oldUpcomingAfter =
  '                        <SixflTvFixtureBadge\n                          recorded={fixture.sixflTvRecorded}\n                          url={fixture.sixflTvUrl}\n                        />\n                        {isSelected ? (\n                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">Selected</span>\n                        ) : index === 0 ? (';
const nativeUpcomingAfter =
  '                        </div>\n                        <SixflTvFixtureBadge\n                          recorded={fixture.sixflTvRecorded}\n                          url={fixture.sixflTvUrl}\n                        />\n                        {isNextUpcoming ? (';

if (!captain.includes("recorded={fixture.sixflTvRecorded}")) {
  if (captain.includes(nativeUpcomingAnchor)) {
    captain = captain.replace(nativeUpcomingAnchor, nativeUpcomingAfter);
  } else if (captain.includes(oldUpcomingAnchor)) {
    captain = captain.replace(oldUpcomingAnchor, oldUpcomingAfter);
  } else {
    throw new Error(
      `Could not apply captain upcoming fixture badges in ${captainPath}`,
    );
  }
}
write(captainPath, captain);

const playerPath = "src/app/player/team/[teamid]/page.tsx";
let player = read(playerPath);
player = replaceRequired(
  playerPath,
  player,
  'import { authOptions } from "@/auth";\n',
  'import { authOptions } from "@/auth";\nimport SixflTvFixtureBadge from "@/components/sixfl-tv/SixflTvFixtureBadge";\n',
  "player badge import",
);
player = replaceRequired(
  playerPath,
  player,
  '        pitch: true,\n        homeTeamId: true,',
  '        pitch: true,\n        sixflTvRecorded: true,\n        sixflTvUrl: true,\n        homeTeamId: true,',
  "player upcoming tv fields",
);
player = replaceRequired(
  playerPath,
  player,
  '                          <div className="font-semibold text-white">\n                            {getFixtureLabel({ homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name })}\n                          </div>',
  '                          <div className="flex flex-wrap items-center gap-2">\n                            <div className="font-semibold text-white">\n                              {getFixtureLabel({ homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name })}\n                            </div>\n                            <SixflTvFixtureBadge\n                              recorded={fixture.sixflTvRecorded}\n                              url={fixture.sixflTvUrl}\n                            />\n                          </div>',
  "player upcoming fixture badges",
);
write(playerPath, player);

console.log("Applied shared SIXFL TV badges to captain and player fixtures.");
