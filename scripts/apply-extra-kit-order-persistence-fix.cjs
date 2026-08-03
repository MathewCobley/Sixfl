const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dbPath = "src/lib/kits/db.ts";

function absolute(filePath) {
  return path.join(root, filePath);
}

function read(filePath) {
  return fs.readFileSync(absolute(filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(absolute(filePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

let db = read(dbPath);

// Standard teams have no included allocation. Their first valid order can be a
// single £20 kit, so application validation must agree with the database and the
// payment summary instead of requiring the old seven-kit minimum.
db = replaceRequired(
  db,
  "    input.kitQuantity < TEAM_KIT_QUANTITY ||",
  "    input.kitQuantity < 1 ||",
  "one-or-more paid kit quantity validation",
);

// A submitted order can be reopened only to add newly paid rows. Its previously
// confirmed design may since have been retired from the public catalogue; that
// must not make the expanded order impossible to save. New selections still
// require an active design.
db = replaceRequired(
  db,
  [
    "    const designRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`",
    '      SELECT "id"',
    '      FROM "KitDesign"',
    '      WHERE "id" = ${input.kitDesignId}',
    '        AND "isActive" = TRUE',
    "      LIMIT 1",
    "    `);",
  ].join("\n"),
  [
    "    const designRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`",
    '      SELECT design."id"',
    '      FROM "KitDesign" design',
    '      WHERE design."id" = ${input.kitDesignId}',
    "        AND (",
    '          design."isActive" = TRUE',
    "          OR EXISTS (",
    "            SELECT 1",
    '            FROM "TeamKitOrder" existing_order',
    '            WHERE existing_order."teamId" = ${input.teamId}',
    '              AND existing_order."kitDesignId" = design."id"',
    "          )",
    "        )",
    "      LIMIT 1",
    "    `);",
  ].join("\n"),
  "existing confirmed design compatibility",
);

write(dbPath, db);

const finalDb = read(dbPath);
if (
  !finalDb.includes("input.kitQuantity < 1 ||") ||
  !finalDb.includes('FROM "TeamKitOrder" existing_order') ||
  finalDb.includes("input.kitQuantity < TEAM_KIT_QUANTITY ||")
) {
  throw new Error("Paid extra-kit persistence compatibility was not applied.");
}

console.log(
  "Kit orders can now start at one paid kit and retain an existing confirmed design when extra rows are added.",
);
