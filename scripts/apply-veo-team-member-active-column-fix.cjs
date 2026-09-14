const fs = require("node:fs");
const path = require("node:path");

const targetPath = path.join(
  process.cwd(),
  "src",
  "lib",
  "veo",
  "fixture-bookings.ts",
);

if (!fs.existsSync(targetPath)) {
  throw new Error("Veo fixture booking source was not found.");
}

let source = fs.readFileSync(targetPath, "utf8");
const invalid = ' AND COALESCE(m."isActive",true)';

if (source.includes(invalid)) {
  source = source.replace(invalid, "");
  fs.writeFileSync(targetPath, source, "utf8");
  console.log("Removed invalid TeamMember.isActive reference from Veo booking validation.");
} else if (source.includes('m."isActive"')) {
  throw new Error("Veo booking validation still references the nonexistent TeamMember.isActive column.");
} else {
  console.log("Veo TeamMember active-column fix already applied.");
}

if (source.includes('m."isActive"')) {
  throw new Error("Veo booking validation still references TeamMember.isActive after patching.");
}
