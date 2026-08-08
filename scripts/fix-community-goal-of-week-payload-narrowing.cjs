const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/components/goal-of-week/CommunityGoalOfWeekPanel.tsx",
);

if (!fs.existsSync(filePath)) {
  throw new Error("Community Goal of the Week panel is missing.");
}

let source = fs.readFileSync(filePath, "utf8");

const before = `      if (!response.ok || !result || "error" in result) {\n        throw new Error(\n          result && "error" in result && result.error\n            ? result.error\n            : "Could not load Goal of the Week.",\n        );\n      }\n      setPayload(result);`;

const after = `      if (!response.ok || !result || !("nomination" in result)) {\n        const apiError =\n          result && "error" in result && typeof result.error === "string"\n            ? result.error\n            : null;\n        throw new Error(apiError || "Could not load Goal of the Week.");\n      }\n      setPayload(result);`;

if (source.includes(before)) {
  source = source.replace(before, after);
  fs.writeFileSync(filePath, source, "utf8");
  console.log("Fixed Community Goal of the Week payload type narrowing.");
} else if (source.includes('!("nomination" in result)')) {
  console.log("Community Goal of the Week payload type narrowing already fixed.");
} else {
  throw new Error("Community Goal of the Week payload narrowing source anchor changed.");
}
