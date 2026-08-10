const fs = require("node:fs");
const path = require("node:path");

const schemaPath = path.join(process.cwd(), "prisma/schema.prisma");
let source = fs.readFileSync(schemaPath, "utf8");

if (!source.includes("standardMatchFeePence Int?")) {
  const marker = "  latestKickoffTime String?\n";

  if (!source.includes(marker)) {
    throw new Error("Team latestKickoffTime marker is missing from Prisma schema.");
  }

  source = source.replace(
    marker,
    `${marker}  standardMatchFeePence Int?\n`,
  );

  fs.writeFileSync(schemaPath, source, "utf8");
}

console.log("Prisma Team model exposes the existing standardMatchFeePence column.");
