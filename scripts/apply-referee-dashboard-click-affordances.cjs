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
const nightsPath = path.join(
  process.cwd(),
  "src",
  "app",
  "(public)",
  "referee",
  "nights",
  "page.tsx",
);

if (!fs.existsSync(pagePath) || !fs.existsSync(nightsPath)) {
  throw new Error("Referee dashboard or dedicated Nights page was not found.");
}

const source = [
  fs.readFileSync(pagePath, "utf8"),
  fs.readFileSync("src/components/referee/RefereeAppHome.tsx", "utf8"),
  fs.readFileSync("src/components/referee/RefereeAppShell.tsx", "utf8"),
  fs.readFileSync(nightsPath, "utf8"),
].join("\n");

// Referee navigation and match-night actions are native React controls.
// Prebuild verifies the app routes and plain-English actions rather than
// rewriting the source or preserving old internal "night sheet" wording.
const requiredNativeMarkers = [
  'href="/referee/availability"',
  'title="Mark your dates"',
  'href="/referee/nights"',
  "Your referee nights",
  "View match night",
  "Run match night",
  "Complete match night",
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
  "Open night sheet",
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
  "Referee navigation and match-night controls are owned natively by React with a dedicated Nights route.",
);
