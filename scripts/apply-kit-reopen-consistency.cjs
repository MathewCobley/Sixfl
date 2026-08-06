const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, source) => fs.writeFileSync(path.join(root, file), source, "utf8");

const dbPath = "src/lib/kits/db.ts";
let db = read(dbPath);

const oldGetOrder = `    WHERE orders."teamId" = \${teamId}\n    LIMIT 1`;
const newGetOrder = `    WHERE orders."teamId" = \${teamId}\n    ORDER BY orders."updatedAt" DESC, orders."createdAt" DESC\n    LIMIT 1`;
if (db.includes(oldGetOrder)) db = db.replace(oldGetOrder, newGetOrder);

const oldExisting = `      WHERE "teamId" = \${input.teamId}\n      FOR UPDATE`;
const newExisting = `      WHERE "teamId" = \${input.teamId}\n      ORDER BY "updatedAt" DESC, "createdAt" DESC\n      LIMIT 1\n      FOR UPDATE`;
if (db.includes(oldExisting)) db = db.replace(oldExisting, newExisting);
write(dbPath, db);

const actionsPath = "src/app/(admin)/admin/kits/actions.ts";
let actions = read(actionsPath);

const oldReopenWhere = `        WHERE "id" = \${orderId}\n      \`);`;
const newReopenWhere = `        WHERE "teamId" = \${teamId}\n      \`);`;
const reopenBlockStart = actions.indexOf('    if (status === "DRAFT") {');
if (reopenBlockStart >= 0) {
  const reopenBlockEnd = actions.indexOf('    } else {', reopenBlockStart);
  if (reopenBlockEnd > reopenBlockStart) {
    const block = actions.slice(reopenBlockStart, reopenBlockEnd);
    if (block.includes(oldReopenWhere)) {
      actions = actions.slice(0, reopenBlockStart) + block.replace(oldReopenWhere, newReopenWhere) + actions.slice(reopenBlockEnd);
    }
  }
}

const oldVerify = `      WHERE "id" = \${orderId}\n      LIMIT 1`;
const newVerify = `      WHERE "teamId" = \${teamId}\n      ORDER BY "updatedAt" DESC, "createdAt" DESC\n      LIMIT 1`;
if (actions.includes(oldVerify)) actions = actions.replace(oldVerify, newVerify);
write(actionsPath, actions);

console.log("Reopened kit orders now unlock every current order row for the team and captain reads use the newest record.");
