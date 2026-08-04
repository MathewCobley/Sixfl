const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const pagePath = path.join(
  root,
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "kit",
  "page.tsx",
);
const actionPath = path.join(
  root,
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "kit",
  "actions.ts",
);

for (const filePath of [pagePath, actionPath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required paid-kit recovery file is missing: ${path.relative(root, filePath)}`);
  }
}

function insertAfterStatement(source, statementStart, addition, label) {
  if (source.includes(addition.trim())) return source;
  const start = source.indexOf(statementStart);
  if (start < 0) throw new Error(`Could not find ${label} start.`);
  const semicolon = source.indexOf(";", start);
  if (semicolon < 0) throw new Error(`Could not find ${label} end.`);
  const insertionPoint = semicolon + 1;
  return source.slice(0, insertionPoint) + addition + source.slice(insertionPoint);
}

function replaceBooleanBlock(source, variableName, replacement, label) {
  const marker = `  const ${variableName} = Boolean(`;
  const start = source.indexOf(marker);
  if (start < 0) {
    if (source.includes(replacement.trim())) return source;
    throw new Error(`Could not find ${label} start.`);
  }
  const end = source.indexOf("\n  );", start);
  if (end < 0) throw new Error(`Could not find ${label} end.`);
  return source.slice(0, start) + replacement + source.slice(end + "\n  );".length);
}

let page = fs.readFileSync(pagePath, "utf8");
if (!page.includes("const savedKitPositions = new Set(")) {
  page = insertAfterStatement(
    page,
    "  const kitQuantity =",
    `
  const savedKitPositions = new Set(
    (order?.items ?? []).map((item) => item.position),
  );
  let savedThroughPosition = 0;
  while (savedKitPositions.has(savedThroughPosition + 1)) {
    savedThroughPosition += 1;
  }`,
    "captain page kitQuantity statement",
  );
}

page = replaceBooleanBlock(
  page,
  "canExpandSubmittedOrder",
  `  const canExpandSubmittedOrder = Boolean(
    order &&
      ["SUBMITTED", "APPROVED"].includes(order.status) &&
      savedThroughPosition < kitQuantity,
  );`,
  "captain page canExpandSubmittedOrder block",
);

page = page.replace(
  /Additional kits have now been paid for\.[^\n]*then submit it again\./,
  "Additional kits have now been paid for. This order has been reopened so you can complete kit {savedThroughPosition + 1} to {kitQuantity}, then submit it again.",
);
page = page.replace(
  /canExpandSubmittedOrder\s*\?\s*order\?\.kitQuantity\s*\?\?\s*0\s*:\s*0/g,
  "canExpandSubmittedOrder ? savedThroughPosition : 0",
);

let action = fs.readFileSync(actionPath, "utf8");
if (!action.includes("const savedKitPositions = new Set(")) {
  action = insertAfterStatement(
    action,
    "  const kitQuantity =",
    `
  const savedKitPositions = new Set(
    (existingOrder?.items ?? []).map((item) => item.position),
  );
  let savedThroughPosition = 0;
  while (savedKitPositions.has(savedThroughPosition + 1)) {
    savedThroughPosition += 1;
  }`,
    "kit save action kitQuantity statement",
  );
}

action = replaceBooleanBlock(
  action,
  "canExpandSubmittedOrder",
  `  const canExpandSubmittedOrder = Boolean(
    existingOrder &&
      ["SUBMITTED", "APPROVED"].includes(existingOrder.status) &&
      savedThroughPosition < kitQuantity,
  );`,
  "kit save action canExpandSubmittedOrder block",
);

const required = [
  [page, "savedThroughPosition < kitQuantity", "page incomplete-row reopening"],
  [page, "kit {savedThroughPosition + 1}", "page recovery wording"],
  [action, "savedThroughPosition < kitQuantity", "action incomplete-row reopening"],
  [action, "position <= kitQuantity", "dynamic save loop"],
  [action, "hasEverySavedKitPosition(savedOrder, kitQuantity)", "post-save audit"],
];

for (const [source, marker, label] of required) {
  if (!source.includes(marker)) {
    throw new Error(`Paid extra-kit recovery check failed: ${label}.`);
  }
}

fs.writeFileSync(pagePath, page, "utf8");
fs.writeFileSync(actionPath, action, "utf8");

console.log(
  "Incomplete submitted kit orders reopen from the first missing paid row, even when the stored quantity already says nine.",
);
