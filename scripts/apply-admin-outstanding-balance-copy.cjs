const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/payments/page.tsx",
);

const before = "Team charge balances now include paid squad payments.";
const after =
  "Total still owed to SIXFL across team charges. Open player links are not added twice; player payments reduce this balance when paid.";

let source = fs.readFileSync(filePath, "utf8");

if (!source.includes(after)) {
  if (!source.includes(before)) {
    throw new Error("Expected admin outstanding-balance copy was not found.");
  }
  source = source.replace(before, after);
  fs.writeFileSync(filePath, source, "utf8");
}

console.log("Clarified the admin outstanding balance so open player links are not mistaken for extra debt.");
