const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

const layoutPath = "src/app/captain/team/[teamid]/layout.tsx";
let layout = read(layoutPath);

layout = replaceOnce(
  layout,
  'import CaptainSupportPanel from "@/components/captain/CaptainSupportPanel";',
  [
    'import CaptainSupportPanel from "@/components/captain/CaptainSupportPanel";',
    'import CaptainTeamNudges from "@/components/captain/CaptainTeamNudges";',
  ].join("\n"),
  "captain team nudge import",
);

layout = replaceOnce(
  layout,
  "          <CaptainSupportPanel teamId={team.id} />\n          {children}",
  [
    "          <CaptainSupportPanel teamId={team.id} />",
    "          <CaptainTeamNudges teamId={team.id} />",
    "          {children}",
  ].join("\n"),
  "captain team nudge placement",
);

write(layoutPath, layout);

const resultsPath = "src/app/captain/team/[teamid]/results/page.tsx";
let results = read(resultsPath);

results = replaceOnce(
  results,
  [
    "      const needsPom = !matchDetails?.playerOfMatchName;",
    "      const needsAppearances = matchPerformances.length === 0;",
  ].join("\n"),
  [
    "      const needsPom = !matchDetails?.playerOfMatchName;",
    "      const needsAppearances = matchPerformances.length === 0;",
    "      const needsRatings = matchPerformances.some(",
    "        (performance) => performance.played && performance.rating === null,",
    "      );",
  ].join("\n"),
  "results pending rating calculation",
);

results = replaceOnce(
  results,
  [
    "        needsPom,",
    "        needsAppearances,",
    "        latestDispute:",
  ].join("\n"),
  [
    "        needsPom,",
    "        needsAppearances,",
    "        needsRatings,",
    "        latestDispute:",
  ].join("\n"),
  "results pending rating row value",
);

results = replaceOnce(
  results,
  "        !(row.needsScorers || row.needsPom || row.needsAppearances)",
  "        !(row.needsScorers || row.needsPom || row.needsAppearances || row.needsRatings)",
  "results needs-completion rating filter",
);

results = replaceOnce(
  results,
  "            !row.needsScorers && !row.needsPom && !row.needsAppearances;",
  [
    "            !row.needsScorers &&",
    "            !row.needsPom &&",
    "            !row.needsAppearances &&",
    "            !row.needsRatings;",
  ].join("\n"),
  "results completion rating rule",
);

write(resultsPath, results);

if (
  !layout.includes("<CaptainTeamNudges teamId={team.id} />") ||
  !results.includes("const needsRatings = matchPerformances.some(") ||
  !results.includes("row.needsRatings")
) {
  throw new Error("Captain team ratings and kit nudges were not applied correctly.");
}

console.log(
  "Captains now receive data-driven player-rating and team-kit nudges below the help panel.",
);
