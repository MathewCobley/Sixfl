const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, source) => fs.writeFileSync(path.join(root, file), source, "utf8");

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor.`);
  return source.replace(before, after);
}

const file = "src/lib/managed-squad/squadStatus.ts";
let source = read(file);

// The inactive flag is the source of truth for current squad surfaces. Cleanup of
// old/future ancillary rows must not be able to turn a simple status save into a
// 500 error. Historic payment links/history are deliberately left untouched.
if (!source.includes("async function runInactiveCleanupSafely")) {
  const anchor = `async function clearFutureActivityForInactivePlayer(input: {`;
  const helper = `async function runInactiveCleanupSafely(\n  label: string,\n  task: () => Promise<unknown>,\n) {\n  try {\n    await task();\n  } catch (error) {\n    console.error(\`Inactive squad cleanup failed: \${label}\`, error);\n  }\n}\n\n${anchor}`;
  source = replaceRequired(source, anchor, helper, "inactive cleanup helper");
}

const oldBlock = `  if (didUpdate && input.status === "INACTIVE") {\n    await Promise.all([\n      cancelQueuedAvailabilityChasesForUnavailablePlayer({\n        membershipId: input.membershipId,\n        db,\n        reason: "Player marked inactive; future availability chase cancelled.",\n      }),\n      clearFutureActivityForInactivePlayer({\n        membershipId: input.membershipId,\n        teamId: input.teamId,\n        db,\n      }),\n    ]);\n  }`;

const newBlock = `  if (didUpdate && input.status === "INACTIVE") {\n    await Promise.all([\n      runInactiveCleanupSafely("availability chases", () =>\n        cancelQueuedAvailabilityChasesForUnavailablePlayer({\n          membershipId: input.membershipId,\n          db,\n          reason: "Player marked inactive; future availability chase cancelled.",\n        }),\n      ),\n      runInactiveCleanupSafely("future squad activity", () =>\n        clearFutureActivityForInactivePlayer({\n          membershipId: input.membershipId,\n          teamId: input.teamId,\n          db,\n        }),\n      ),\n    ]);\n  }`;

source = replaceRequired(source, oldBlock, newBlock, "safe inactive cleanup");
write(file, source);

if (!source.includes("runInactiveCleanupSafely")) {
  throw new Error("Inactive status resilience marker missing.");
}

console.log("Inactive player status saves now survive ancillary cleanup failures; historic payment links remain untouched.");
