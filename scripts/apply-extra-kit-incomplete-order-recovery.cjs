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

function addSavedPositionState(source, anchor, label) {
  if (source.includes("let savedThroughPosition = 0;")) return source;
  if (!source.includes(anchor)) {
    throw new Error(`Could not find ${label} quantity anchor.`);
  }

  const addition = `${anchor}
  const savedKitPositions = new Set(
    (existingOrder?.items ?? order?.items ?? []).map((item) => item.position),
  );
  let savedThroughPosition = 0;
  while (savedKitPositions.has(savedThroughPosition + 1)) {
    savedThroughPosition += 1;
  }`;

  return source.replace(anchor, addition);
}

let page = fs.readFileSync(pagePath, "utf8");

if (!page.includes("let savedThroughPosition = 0;")) {
  const pageAnchor = `  const kitQuantity = supplierLocked
    ? order?.kitQuantity ?? paidKitQuantity
    : Math.max(order?.kitQuantity ?? TEAM_KIT_QUANTITY, paidKitQuantity);`;
  if (!page.includes(pageAnchor)) {
    throw new Error("Captain kit page dynamic quantity calculation was not found.");
  }

  page = page.replace(
    pageAnchor,
    `${pageAnchor}
  const savedKitPositions = new Set(
    (order?.items ?? []).map((item) => item.position),
  );
  let savedThroughPosition = 0;
  while (savedKitPositions.has(savedThroughPosition + 1)) {
    savedThroughPosition += 1;
  }`,
  );
}

page = page.replace(
  /  const canExpandSubmittedOrder = Boolean\(\n    order &&\n      \["SUBMITTED", "APPROVED"\]\.includes\(order\.status\) &&\n      order\.kitQuantity < kitQuantity,\n  \);/,
  `  const canExpandSubmittedOrder = Boolean(
    order &&
      ["SUBMITTED", "APPROVED"].includes(order.status) &&
      savedThroughPosition < kitQuantity,
  );`,
);

page = page.replace(
  /Additional kits have now been paid for\. This order has been reopened so you can complete kit \{order \? order\.kitQuantity \+ 1 : TEAM_KIT_QUANTITY \+ 1\} to \{kitQuantity\}, then submit it again\./,
  "Additional kits have now been paid for. This order has been reopened so you can complete kit {savedThroughPosition + 1} to {kitQuantity}, then submit it again.",
);

page = page.replace(
  /canExpandSubmittedOrder \? order\?\.kitQuantity \?\? 0 : 0/,
  "canExpandSubmittedOrder ? savedThroughPosition : 0",
);

let action = fs.readFileSync(actionPath, "utf8");

if (!action.includes("let savedThroughPosition = 0;")) {
  const actionAnchor = `  const kitQuantity = Math.max(
    existingOrder?.kitQuantity ?? TEAM_KIT_QUANTITY,
    extraKitPaymentSummary.totalKitQuantity,
  );`;
  if (!action.includes(actionAnchor)) {
    throw new Error("Kit save action dynamic quantity calculation was not found.");
  }

  action = action.replace(
    actionAnchor,
    `${actionAnchor}
  const savedKitPositions = new Set(
    (existingOrder?.items ?? []).map((item) => item.position),
  );
  let savedThroughPosition = 0;
  while (savedKitPositions.has(savedThroughPosition + 1)) {
    savedThroughPosition += 1;
  }`,
  );
}

action = action.replace(
  /  const canExpandSubmittedOrder = Boolean\(\n    existingOrder &&\n      \["SUBMITTED", "APPROVED"\]\.includes\(existingOrder\.status\) &&\n      existingOrder\.kitQuantity < kitQuantity,\n  \);/,
  `  const canExpandSubmittedOrder = Boolean(
    existingOrder &&
      ["SUBMITTED", "APPROVED"].includes(existingOrder.status) &&
      savedThroughPosition < kitQuantity,
  );`,
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
  "Submitted kit orders with missing paid positions now reopen from the first missing row, even when the stored kit quantity already says nine.",
);
