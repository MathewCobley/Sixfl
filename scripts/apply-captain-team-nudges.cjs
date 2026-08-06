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

// Captain nudges are dashboard-only. Remove any legacy shared-layout mount/import so
// they do not appear on every captain sub-page.
layout = layout
  .replaceAll('import CaptainTeamNudges from "@/components/captain/CaptainTeamNudges";\n', "")
  .replaceAll("          <CaptainTeamNudges teamId={team.id} />\n", "")
  .replaceAll("          <CaptainTeamNudges teamId={team.id} />", "");

write(layoutPath, layout);

const overviewPath = "src/app/captain/team/[teamid]/page.tsx";
let overview = read(overviewPath);

const overviewImport = 'import CaptainTeamNudges from "@/components/captain/CaptainTeamNudges";';
if (!overview.includes(overviewImport)) {
  const importAnchor = 'import CaptainOnboardingChecklist from "@/components/captain/CaptainOnboardingChecklist";';
  if (!overview.includes(importAnchor)) {
    throw new Error("Expected captain overview import anchor was not found.");
  }
  overview = overview.replace(importAnchor, `${importAnchor}\n${overviewImport}`);
}

if (!overview.includes("<CaptainTeamNudges teamId={teamid} />")) {
  const rootAnchor = '    <div className="space-y-8">';
  if (!overview.includes(rootAnchor)) {
    throw new Error("Expected captain overview root was not found.");
  }
  overview = overview.replace(
    rootAnchor,
    `${rootAnchor}\n      <CaptainTeamNudges teamId={teamid} />`,
  );
}

write(overviewPath, overview);

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
  layout.includes("CaptainTeamNudges") ||
  !overview.includes(overviewImport) ||
  !overview.includes("<CaptainTeamNudges teamId={teamid} />") ||
  !results.includes("const needsRatings = matchPerformances.some(") ||
  !results.includes("row.needsRatings")
) {
  throw new Error("Dashboard-only captain nudges and completion filters were not applied correctly.");
}

console.log(
  "Captain rating and kit nudges now appear only on the team overview; result completion filters remain enabled.",
);
