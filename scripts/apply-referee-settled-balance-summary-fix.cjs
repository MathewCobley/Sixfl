const fs = require("node:fs");
const path = require("node:path");

const file = "src/app/(public)/referee/page.tsx";
const absolute = path.join(process.cwd(), ...file.split("/"));

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Referee settled-balance fix source missing: ${label}`);
  }
  return source.replace(before, after);
}

let source = fs.readFileSync(absolute, "utf8");

source = replaceRequired(
  source,
  `  const canOpen = night.status !== "SETTLED" && night.status !== "CANCELLED";\n  const isPayable = isNightPayable(night, todayLondonDate);`,
  `  const canOpen = night.status !== "SETTLED" && night.status !== "CANCELLED";\n  const isPayable = isNightPayable(night, todayLondonDate);\n  const isSettled = night.status === "SETTLED";`,
  "settled night display state",
);

source = replaceRequired(
  source,
  `            <span className="text-amber-100/45">{isPayable ? "Due " : "After night "}</span>`,
  `            <span className="text-amber-100/45">{isSettled ? "Paid " : isPayable ? "Due " : "After night "}</span>`,
  "night-card payment wording",
);

source = replaceRequired(
  source,
  `  const payableActiveNights = activeNights.filter((night) =>\n    isNightPayable(night, todayLondonDate),\n  );\n  const outstandingDueToSixfl = payableActiveNights.reduce(\n    (sum, night) => sum + night.dueToSixflPence,\n    0,\n  );\n  const outstandingDueToReferee = payableActiveNights.reduce(\n    (sum, night) => sum + night.dueToRefereePence,\n    0,\n  );`,
  `  const outstandingNights = activeNights.filter(\n    (night) => night.status !== "SETTLED" && isNightPayable(night, todayLondonDate),\n  );\n  const outstandingDueToSixfl = outstandingNights.reduce(\n    (sum, night) => sum + night.dueToSixflPence,\n    0,\n  );\n  const outstandingDueToReferee = outstandingNights.reduce(\n    (sum, night) => sum + night.dueToRefereePence,\n    0,\n  );`,
  "outstanding referee summary",
);

if (!source.includes('night.status !== "SETTLED" && isNightPayable(night, todayLondonDate)')) {
  throw new Error("Referee settled-balance fix failed: settled nights are still included in outstanding totals.");
}

if (!source.includes('{isSettled ? "Paid " : isPayable ? "Due " : "After night "}')) {
  throw new Error("Referee settled-balance fix failed: settled nights are not labelled as paid.");
}

fs.writeFileSync(absolute, source, "utf8");
console.log(
  "Referee dashboard now excludes settled nights from Due totals and labels settled night amounts as Paid.",
);
