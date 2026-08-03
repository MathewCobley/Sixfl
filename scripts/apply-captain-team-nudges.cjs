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

// Keep the priority action panel immediately below the permanent team header and
// navigation. It must sit above help and every page-specific section.
layout = layout
  .replaceAll("          <CaptainTeamNudges teamId={team.id} />\n", "")
  .replaceAll("          <CaptainTeamNudges teamId={team.id} />", "");

const supportAnchor = "          <CaptainSupportPanel teamId={team.id} />";
if (!layout.includes(supportAnchor)) {
  throw new Error("Expected captain support panel anchor was not found.");
}
layout = layout.replace(
  supportAnchor,
  [
    "          <CaptainTeamNudges teamId={team.id} />",
    supportAnchor,
  ].join("\n"),
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

const nudgePosition = layout.indexOf("<CaptainTeamNudges teamId={team.id} />");
const supportPosition = layout.indexOf("<CaptainSupportPanel teamId={team.id} />");

if (
  nudgePosition < 0 ||
  supportPosition < 0 ||
  nudgePosition > supportPosition ||
  !results.includes("const needsRatings = matchPerformances.some(") ||
  !results.includes("row.needsRatings")
) {
  throw new Error("Captain priority actions and completion filters were not applied correctly.");
}

console.log(
  "Captain fixture confirmation, rating and kit actions now appear above help in priority order.",
);
