const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/squad/join/[token]/page.tsx",
);

let source = fs.readFileSync(filePath, "utf8");
const pageMarker = "export default async function ManagedSquadJoinPage";
const markerIndex = source.indexOf(pageMarker);

if (markerIndex < 0) {
  throw new Error("Managed squad join page marker was not found.");
}

const before = "      email: true,\n      status: true,\n      teamId: true,";
const after =
  "      email: true,\n      status: true,\n      source: true,\n      teamId: true,";
const targetIndex = source.indexOf(before, markerIndex);

if (targetIndex >= 0) {
  source =
    source.slice(0, targetIndex) +
    after +
    source.slice(targetIndex + before.length);
  fs.writeFileSync(filePath, source, "utf8");
}

const pageSection = source.slice(markerIndex);
if (
  !pageSection.includes("source: true") ||
  !pageSection.includes('prospect.source === "SHARED_EMAIL_ACCOUNT_PENDING"')
) {
  throw new Error(
    "The managed squad join page does not load the persistent shared-email conflict state.",
  );
}

console.log(
  "Managed squad join page now loads the shared-email identity conflict state.",
);
