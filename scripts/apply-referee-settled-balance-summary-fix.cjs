const fs = require("node:fs");
const path = require("node:path");

const file = "src/app/(public)/referee/page.tsx";
const absolute = path.join(process.cwd(), ...file.split("/"));
const source = fs.readFileSync(absolute, "utf8");

// The referee dashboard now owns balance timing and settled-night presentation
// natively. Prebuild must verify those safeguards, not rewrite the React source.
const requiredMarkers = [
  'night.status !== "SETTLED" && isNightPayable(night, todayLondonDate)',
  'const isSettled = night.status === "SETTLED";',
  'const dueNowPence = isSettled',
  '{isSettled ? "Balance" : "Due now"}',
  'night.nightDate > todayLondonDate',
  'night.submittedAt || night.approvedAt || night.settledAt',
];

for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    throw new Error(
      `Referee native balance safeguard is missing required marker: ${marker}`,
    );
  }
}

console.log(
  "Referee dashboard natively excludes settled/future balances and only makes same-day fees due after the night is finished.",
);
