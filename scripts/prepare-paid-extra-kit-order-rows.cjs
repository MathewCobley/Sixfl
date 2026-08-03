const fs = require("node:fs");
const path = require("node:path");

const filePath = path.resolve(
  __dirname,
  "../src/app/(admin)/admin/kits/page.tsx",
);

let source = fs.readFileSync(filePath, "utf8");
const canonicalCopy =
  "              Upload the supplier designs, manage which kits captains can choose and process each team&apos;s personalised order of {TEAM_KIT_QUANTITY} kits.";

if (!source.includes(canonicalCopy)) {
  const pattern =
    /              Upload the supplier designs, manage which kits captains can choose and process each team&apos;s personalised order of \{TEAM_KIT_QUANTITY\} kits\. Each package carries a compulsory £(?:70|90) team contribution before the supplier order is placed\./;

  if (!pattern.test(source)) {
    throw new Error(
      "Expected legacy admin kit-package copy was not found before dynamic quantity conversion.",
    );
  }

  source = source.replace(pattern, canonicalCopy);
  fs.writeFileSync(filePath, source, "utf8");
}

console.log("Prepared admin kit copy for paid additional-kit quantities.");
