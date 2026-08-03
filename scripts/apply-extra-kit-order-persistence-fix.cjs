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

let db = read(dbPath);

// Standard teams have no included allocation. Their first valid order can be a
// single £20 kit, so application validation must agree with the paid quantity
// rather than retaining the former seven-kit minimum.
const oldMinimum = "    input.kitQuantity < TEAM_KIT_QUANTITY ||";
const paidKitMinimum = "    input.kitQuantity < 1 ||";

if (!db.includes(paidKitMinimum)) {
  if (!db.includes(oldMinimum)) {
    throw new Error(
      "Expected dynamic kit quantity validation was not found in the kit database helper.",
    );
  }

  db = db.replace(oldMinimum, paidKitMinimum);
}

write(dbPath, db);

const finalDb = read(dbPath);
if (
  !finalDb.includes(paidKitMinimum) ||
  finalDb.includes(oldMinimum)
) {
  throw new Error("One-or-more paid kit validation was not applied.");
}

console.log(
  "Kit orders can now start at one paid kit while retaining the server-authorised maximum.",
);
