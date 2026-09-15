const fs = require("node:fs");
const path = require("node:path");

const dashboardPath = path.join(
  process.cwd(),
  "src",
  "app",
  "(public)",
  "referee",
  "page.tsx",
);

if (!fs.existsSync(dashboardPath)) {
  throw new Error(`Referee dashboard not found: ${dashboardPath}`);
}

let source = fs.readFileSync(dashboardPath, "utf8");

// An earlier production-preparation patch already changes these two reducers
// to ignore SETTLED nights. Normalise only this small block back to the native
// shape so the newer part-payment patch can replace it with the canonical
// remaining-balance helpers. This keeps the source-preparation chain compatible
// without changing the earlier historical patch.
const totalsPattern = /  const outstandingDueToSixfl = payableActiveNights\.reduce\([\s\S]*?\n  \);\n  const outstandingDueToReferee = payableActiveNights\.reduce\([\s\S]*?\n  \);/;

const nativeTotals = `  const outstandingDueToSixfl = payableActiveNights.reduce(
    (sum, night) => sum + night.dueToSixflPence,
    0,
  );
  const outstandingDueToReferee = payableActiveNights.reduce(
    (sum, night) => sum + night.dueToRefereePence,
    0,
  );`;

if (!totalsPattern.test(source)) {
  throw new Error("Could not locate the prepared referee dashboard outstanding-total reducers.");
}

source = source.replace(totalsPattern, nativeTotals);
fs.writeFileSync(dashboardPath, source, "utf8");

console.log("Referee dashboard outstanding-total reducers normalised for part-payment preparation.");
