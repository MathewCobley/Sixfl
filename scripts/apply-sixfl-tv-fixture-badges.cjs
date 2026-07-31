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

patch("src/app/captain/team/[teamid]/fixtures/page.tsx", [
  [
    'import TeamShirt from "@/components/fixtures/TeamShirt";\n',
    'import TeamShirt from "@/components/fixtures/TeamShirt";\nimport SixflTvFixtureBadge from "@/components/sixfl-tv/SixflTvFixtureBadge";\n',
    "captain badge import",
  ],
  [
    '      take: 20,\n      include: {\n        homeTeam: { select: { id: true, name: true } },',
    '      take: 20,\n      include: {\n        sixflTvRecorded: true,\n        sixflTvUrl: true,\n        homeTeam: { select: { id: true, name: true } },',
    "captain upcoming tv fields",
  ],
  [
    '            </h2>\n            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">',
    '            </h2>\n            {selectedFixture ? (\n              <div className="mt-3">\n                <SixflTvFixtureBadge\n                  recorded={selectedFixture.sixflTvRecorded}\n                  url={selectedFixture.sixflTvUrl}\n                />\n              </div>\n            ) : null}\n            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">',
    "captain selected fixture badge",
  ],
  [
    '                        {isSelected ? (\n                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">Selected</span>\n                        ) : index === 0 ? (',
    '                        <SixflTvFixtureBadge\n                          recorded={fixture.sixflTvRecorded}\n                          url={fixture.sixflTvUrl}\n                        />\n                        {isSelected ? (\n                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">Selected</span>\n                        ) : index === 0 ? (',
    "captain upcoming fixture badges",
  ],
]);

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

console.log("Applied shared SIXFL TV badges to captain and player fixtures.");
