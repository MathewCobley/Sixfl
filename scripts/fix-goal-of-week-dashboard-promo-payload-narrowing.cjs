const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/components/goal-of-week/GoalOfWeekDashboardPromo.tsx",
);

if (!fs.existsSync(filePath)) {
  console.log("Goal of the Week dashboard promo is not present; no payload narrowing patch needed.");
  return;
}

let source = fs.readFileSync(filePath, "utf8");

const unsafeCondition = 'if (!cancelled && response.ok && result && !("error" in result)) {';
const safeCondition = 'if (!cancelled && response.ok && result && "nomination" in result) {';

if (source.includes(unsafeCondition)) {
  source = source.replace(unsafeCondition, safeCondition);
  fs.writeFileSync(filePath, source, "utf8");
  console.log("Fixed Goal of the Week dashboard promo payload type narrowing.");
} else if (source.includes(safeCondition)) {
  console.log("Goal of the Week dashboard promo payload type narrowing already fixed.");
} else {
  const unsafeSetPayload = "setPayload(result);";
  if (source.includes(unsafeSetPayload) && source.includes("type GoalPayload")) {
    source = source.replace(unsafeSetPayload, "setPayload(result as GoalPayload);");
    fs.writeFileSync(filePath, source, "utf8");
    console.log("Fixed Goal of the Week dashboard promo payload assignment with an explicit GoalPayload narrowing.");
  } else {
    throw new Error("Goal of the Week dashboard promo payload narrowing source anchor changed.");
  }
}
