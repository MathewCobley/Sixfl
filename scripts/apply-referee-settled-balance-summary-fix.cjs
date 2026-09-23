const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), ...file.split("/")), "utf8");
}

const page = read("src/app/(public)/referee/page.tsx");
const balances = read("src/lib/referee-nights.ts");

// Referee balance timing and payment presentation are owned by one shared source
// of truth in referee-nights.ts. Prebuild verifies those safeguards rather than
// rewriting the React source.
const pageMarkers = [
  "getRefereePayableDueToRefereePence",
  "getRefereePayableDueToSixflPence",
  "isRefereeNightPayable",
  "night.cashPaidToRefereePence",
  "night.cashReceivedFromRefereePence",
  '"Paid to you"',
];

const helperMarkers = [
  'return night.status !== "CANCELLED" && night.nightDate < todayLondonDate;',
  'night.status === "SETTLED"',
  "getRefereeRemainingDueToRefereePence(night)",
  "getRefereeRemainingDueToSixflPence(night)",
];

for (const marker of pageMarkers) {
  if (!page.includes(marker)) {
    throw new Error(
      `Referee portal balance safeguard is missing required marker: ${marker}`,
    );
  }
}

for (const marker of helperMarkers) {
  if (!balances.includes(marker)) {
    throw new Error(
      `Canonical referee balance helper is missing required marker: ${marker}`,
    );
  }
}

console.log(
  "Referee balances use canonical past-night timing, exclude settled/future balances, and subtract recorded payments.",
);
