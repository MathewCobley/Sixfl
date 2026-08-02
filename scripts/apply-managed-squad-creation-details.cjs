const fs = require("node:fs");
const path = require("node:path");

const layoutPath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/layout.tsx",
);
let source = fs.readFileSync(layoutPath, "utf8");

const importLine =
  'import ManagedSquadCreationDetailsBridge from "@/components/captain/ManagedSquadCreationDetailsBridge";';

if (!source.includes(importLine)) {
  const importAnchor =
    'import ManagedSquadEditLinks from "@/components/captain/ManagedSquadEditLinks";';

  if (!source.includes(importAnchor)) {
    throw new Error("Managed squad edit-links import anchor was not found.");
  }

  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const renderLine =
  "      {access.isAdmin ? <ManagedSquadCreationDetailsBridge /> : null}";

if (!source.includes(renderLine)) {
  const renderAnchor = "      {access.isAdmin ? <ManagedSquadEditLinks /> : null}";

  if (!source.includes(renderAnchor)) {
    throw new Error("Managed squad edit-links render anchor was not found.");
  }

  source = source.replace(renderAnchor, `${renderAnchor}\n${renderLine}`);
}

fs.writeFileSync(layoutPath, source, "utf8");

if (
  !source.includes("ManagedSquadCreationDetailsBridge") ||
  !source.includes(renderLine)
) {
  throw new Error("Managed squad creation details bridge was not mounted.");
}

console.log(
  "Mounted player creation method and creator details on the managed squad page.",
);
