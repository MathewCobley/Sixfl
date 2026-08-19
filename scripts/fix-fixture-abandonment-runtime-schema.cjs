const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function patch(relativePath, replacements) {
  const filePath = path.join(root, ...relativePath.split("/"));
  let source = fs.readFileSync(filePath, "utf8");

  for (const { before, after, label } of replacements) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      throw new Error(`Expected ${label} source was not found in ${relativePath}.`);
    }
    source = source.replace(before, after);
  }

  fs.writeFileSync(filePath, source, "utf8");
}

patch("src/lib/fixtures/abandonment.ts", [
  {
    label: "abandonment row awarded fields",
    before: [
      "  awayScoreAtAbandonment: number | null;",
      "  awardedHomeScore: number | null;",
      "  awardedAwayScore: number | null;",
      "  resultDecidedByUserId: string | null;",
      "  resultDecidedAt: Date | null;",
      "  recordedAt: Date;",
    ].join("\n"),
    after: [
      "  awayScoreAtAbandonment: number | null;",
      "  recordedAt: Date;",
    ].join("\n"),
  },
  {
    label: "abandonment result select columns",
    before: [
      '      "homeScoreAtAbandonment",',
      '      "awayScoreAtAbandonment",',
      '      "awardedHomeScore",',
      '      "awardedAwayScore",',
      '      "resultDecidedByUserId",',
      '      "resultDecidedAt",',
      '      "recordedAt"',
    ].join("\n"),
    after: [
      '      "homeScoreAtAbandonment",',
      '      "awayScoreAtAbandonment",',
      '      "recordedAt"',
    ].join("\n"),
  },
  {
    label: "abandonment result audit columns",
    before: [
      '        "homeScoreAtAbandonment",',
      '        "awayScoreAtAbandonment",',
      '        "awardedHomeScore",',
      '        "awardedAwayScore",',
      '        "resultDecidedByUserId",',
      '        "resultDecidedAt",',
      '        "recordedByUserId",',
    ].join("\n"),
    after: [
      '        "homeScoreAtAbandonment",',
      '        "awayScoreAtAbandonment",',
      '        "recordedByUserId",',
    ].join("\n"),
  },
  {
    label: "abandonment result audit values",
    before: [
      "        ${fixture.result?.homeScore ?? null},",
      "        ${fixture.result?.awayScore ?? null},",
      "        ${awardedHomeScore},",
      "        ${awardedAwayScore},",
      "        ${hasOfficialResult ? input.recordedByUserId : null},",
      "        ${hasOfficialResult ? new Date() : null},",
      "        ${input.recordedByUserId},",
    ].join("\n"),
    after: [
      "        ${fixture.result?.homeScore ?? null},",
      "        ${fixture.result?.awayScore ?? null},",
      "        ${input.recordedByUserId},",
    ].join("\n"),
  },
]);

patch("src/components/referee/AbandonedMatchForm.tsx", [
  {
    label: "official result prop",
    before: [
      "  abandonment,",
      "  locked,",
      "  canDecideResult,",
      "}: {",
    ].join("\n"),
    after: [
      "  abandonment,",
      "  locked,",
      "  canDecideResult,",
      "  officialResult,",
      "}: {",
    ].join("\n"),
  },
  {
    label: "official result prop type",
    before: [
      "  abandonment: FixtureAbandonmentRow | null;",
      "  locked: boolean;",
      "  canDecideResult: boolean;",
      "}) {",
    ].join("\n"),
    after: [
      "  abandonment: FixtureAbandonmentRow | null;",
      "  locked: boolean;",
      "  canDecideResult: boolean;",
      "  officialResult: { homeScore: number; awayScore: number } | null;",
      "}) {",
    ].join("\n"),
  },
  {
    label: "recorded official result copy",
    before: [
      '        <p className="mt-3 text-xs leading-5 text-white/45">',
      "          {abandonment.awardedHomeScore !== null && abandonment.awardedAwayScore !== null",
      "            ? `Official SIXFL result: ${homeTeam.name} ${abandonment.awardedHomeScore}-${abandonment.awardedAwayScore} ${awayTeam.name}.`",
      '            : "No official result has been awarded yet. The result and league outcome remain for SIXFL to decide."}',
      "        </p>",
    ].join("\n"),
    after: [
      '        <p className="mt-3 text-xs leading-5 text-white/45">',
      "          {officialResult",
      "            ? `Official SIXFL result: ${homeTeam.name} ${officialResult.homeScore}-${officialResult.awayScore} ${awayTeam.name}.`",
      '            : "No official result has been awarded yet. The result and league outcome remain for SIXFL to decide."}',
      "        </p>",
    ].join("\n"),
  },
]);

patch("src/app/(public)/referee/night/[id]/page.tsx", [
  {
    label: "abandonment official result prop",
    before: [
      "                      abandonment={abandonment}",
      "                      locked={locked}",
      "                      canDecideResult={user.role === UserRole.ADMIN}",
      "                    />",
    ].join("\n"),
    after: [
      "                      abandonment={abandonment}",
      "                      locked={locked}",
      "                      canDecideResult={user.role === UserRole.ADMIN}",
      "                      officialResult={fixture.result ? { homeScore: fixture.result.homeScore, awayScore: fixture.result.awayScore } : null}",
      "                    />",
    ].join("\n"),
  },
  {
    label: "abandonment page official result copy",
    before: [
      "                            ? abandonment.awardedHomeScore !== null && abandonment.awardedAwayScore !== null",
      "                              ? `Official SIXFL result: ${fixture.homeTeam.name} ${abandonment.awardedHomeScore}-${abandonment.awardedAwayScore} ${fixture.awayTeam.name}.`",
      '                              : "The referee abandoned this fixture. No official score is recorded yet; SIXFL will decide the result and league outcome separately."',
    ].join("\n"),
    after: [
      "                            ? fixture.result",
      "                              ? `Official SIXFL result: ${fixture.homeTeam.name} ${fixture.result.homeScore}-${fixture.result.awayScore} ${fixture.awayTeam.name}.`",
      '                              : "The referee abandoned this fixture. No official score is recorded yet; SIXFL will decide the result and league outcome separately."',
    ].join("\n"),
  },
]);

console.log("Abandoned-match result decisions now use MatchResult as the runtime source of truth and do not require the optional audit columns to exist before the page can load.");
