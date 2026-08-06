const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, source) => fs.writeFileSync(path.join(root, file), source, "utf8");

const dbPath = "src/lib/kits/db.ts";
let db = read(dbPath);

// A team can have historical duplicate TeamKitOrder rows. An explicitly reopened
// DRAFT row is the active captain order and must win over stale submitted/approved
// rows; otherwise the form can look populated but hide its Save/Submit controls.
const unorderedGetOrder = `    WHERE orders."teamId" = \${teamId}\n    LIMIT 1`;
const updatedGetOrder = `    WHERE orders."teamId" = \${teamId}\n    ORDER BY orders."updatedAt" DESC, orders."createdAt" DESC\n    LIMIT 1`;
const reopenedFirstGetOrder = `    WHERE orders."teamId" = \${teamId}\n    ORDER BY\n      CASE WHEN orders."status" = 'DRAFT' THEN 0 ELSE 1 END,\n      orders."updatedAt" DESC,\n      orders."createdAt" DESC\n    LIMIT 1`;
if (db.includes(unorderedGetOrder)) {
  db = db.replace(unorderedGetOrder, reopenedFirstGetOrder);
} else if (db.includes(updatedGetOrder)) {
  db = db.replace(updatedGetOrder, reopenedFirstGetOrder);
}

const unorderedExisting = `      WHERE "teamId" = \${input.teamId}\n      FOR UPDATE`;
const updatedExisting = `      WHERE "teamId" = \${input.teamId}\n      ORDER BY "updatedAt" DESC, "createdAt" DESC\n      LIMIT 1\n      FOR UPDATE`;
const reopenedFirstExisting = `      WHERE "teamId" = \${input.teamId}\n      ORDER BY\n        CASE WHEN "status" = 'DRAFT' THEN 0 ELSE 1 END,\n        "updatedAt" DESC,\n        "createdAt" DESC\n      LIMIT 1\n      FOR UPDATE`;
if (db.includes(unorderedExisting)) {
  db = db.replace(unorderedExisting, reopenedFirstExisting);
} else if (db.includes(updatedExisting)) {
  db = db.replace(updatedExisting, reopenedFirstExisting);
}
write(dbPath, db);

const actionsPath = "src/app/(admin)/admin/kits/actions.ts";
let actions = read(actionsPath);

const reopenBlockStart = actions.indexOf('    if (status === "DRAFT") {');
if (reopenBlockStart >= 0) {
  const reopenBlockEnd = actions.indexOf('    } else {', reopenBlockStart);
  if (reopenBlockEnd > reopenBlockStart) {
    const block = actions.slice(reopenBlockStart, reopenBlockEnd);
    const idWhere = `        WHERE "id" = \${orderId}\n      \`);`;
    const teamWhere = `        WHERE "teamId" = \${teamId}\n      \`);`;
    if (block.includes(idWhere)) {
      actions =
        actions.slice(0, reopenBlockStart) +
        block.replace(idWhere, teamWhere) +
        actions.slice(reopenBlockEnd);
    }
  }
}

// Verification must inspect the active row for the team after a reopen, not a
// stale historical order id.
const oldVerify = `      WHERE "id" = \${orderId}\n      LIMIT 1`;
const newVerify = `      WHERE \${status === "DRAFT" ? Prisma.sql\`"teamId" = \${teamId}\` : Prisma.sql\`"id" = \${orderId}\`}\n      ORDER BY\n        CASE WHEN "status" = 'DRAFT' THEN 0 ELSE 1 END,\n        "updatedAt" DESC,\n        "createdAt" DESC\n      LIMIT 1`;
if (actions.includes(oldVerify)) actions = actions.replace(oldVerify, newVerify);
write(actionsPath, actions);

const finalDb = read(dbPath);
const finalActions = read(actionsPath);
if (!finalDb.includes("CASE WHEN orders.\"status\" = 'DRAFT' THEN 0 ELSE 1 END")) {
  throw new Error("Captain kit lookup does not prefer reopened draft orders.");
}
if (!finalActions.includes('WHERE "teamId" = ${teamId}')) {
  throw new Error("Admin kit reopen is not team-wide.");
}

console.log(
  "Reopened kit orders now take priority for captain reads, remain editable, and can be submitted again.",
);
