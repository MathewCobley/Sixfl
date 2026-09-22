const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(public)",
  "referee",
  "page.tsx",
);

if (!fs.existsSync(pagePath)) {
  throw new Error("Referee dashboard page was not found.");
}

const source = fs.readFileSync(pagePath, "utf8") + fs.readFileSync("src/components/referee/RefereeAppHome.tsx", "utf8");

// This used to be a build-time source rewriter that patched click affordances
// into the rendered referee dashboard. The referee dashboard now owns those
// navigation controls and night-sheet choices directly in React, so prebuild
// should only verify that the native implementation has not regressed.
const requiredNativeMarkers = [
  'href="/referee/availability"',
  'title="Mark your dates"',
  'id="referee-night-picker"',
  "Choose the night you want to work on",
  'href={`/referee/night/${nextNight.id}`}',
  "Open night sheet",
  "Open reopened night",
  'RefereeTabs active="overview"',
  "onsiteByNightId",
  "Payments & cashup",
  "Referee app navigation",
];

for (const marker of requiredNativeMarkers) {
  if (!source.includes(marker)) {
    throw new Error(
      `Referee dashboard native navigation is missing required marker: ${marker}`,
    );
  }
}

const forbiddenLegacyMarkers = [
  'id="referee-nights"',
  'data-referee-expandable-card="schedule"',
  "MutationObserver",
  "document.querySelector",
  "document.createElement",
];

for (const marker of forbiddenLegacyMarkers) {
  if (source.includes(marker)) {
    throw new Error(
      `Referee dashboard still contains legacy click-affordance marker: ${marker}`,
    );
  }
}

console.log(
  "Referee dashboard navigation and night-sheet controls are owned natively by the React page; no prebuild source rewrite is required.",
);
