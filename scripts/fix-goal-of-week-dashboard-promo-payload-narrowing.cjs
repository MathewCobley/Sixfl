const fs = require("node:fs");
const path = require("node:path");

// Compatibility entry retained for the legacy prebuild chain. Monthly rendering
// and payload validation now belong to the native component and shared hook.
// Never overwrite them with the retired weekly setPayload patch.
const root = process.cwd();
const component = fs.readFileSync(path.join(root, "src/components/goal-of-week/GoalOfWeekDashboardPromo.tsx"), "utf8");
const hook = fs.readFileSync(path.join(root, "src/components/goal-of-month/useMonthlyGoals.ts"), "utf8");
if (!component.includes("useMonthlyGoals") || !component.includes("GoalNomineeCard") || !hook.includes("/api/goal-of-month/community")) {
  throw new Error("Native monthly goal dashboard contract is missing.");
}
console.log("Native Goal of the Month dashboard and nominee cards verified; no source rewriting required.");
