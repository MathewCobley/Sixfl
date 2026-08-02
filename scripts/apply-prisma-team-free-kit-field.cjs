const fs = require("node:fs");
const path = require("node:path");

const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
let schema = fs.readFileSync(schemaPath, "utf8");

const field = "  wantsFreeKit      Boolean  @default(false)";

if (!schema.includes(field)) {
  const anchor = "  managerNotes       String?\n";

  if (!schema.includes(anchor)) {
    throw new Error(
      "Could not add Team.wantsFreeKit because the Team model anchor was not found.",
    );
  }

  schema = schema.replace(anchor, `${anchor}${field}\n`);
  fs.writeFileSync(schemaPath, schema, "utf8");
  console.log("Added Team.wantsFreeKit to the Prisma schema before client generation.");
} else {
  console.log("Team.wantsFreeKit is already present in the Prisma schema.");
}

if (!schema.includes(field)) {
  throw new Error("Team.wantsFreeKit is still missing from the Prisma schema.");
}
