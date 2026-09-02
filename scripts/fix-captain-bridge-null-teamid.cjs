const fs = require("node:fs");
const path = require("node:path");

const relative = "src/components/captain/CaptainAdditionalCaptainBridge.tsx";
const full = path.join(process.cwd(), relative);
if (!fs.existsSync(full)) throw new Error(`Missing ${relative}`);

let source = fs.readFileSync(full, "utf8");
const oldBlock = `    const teamId = getCaptainSquadTeamId(pathname);\n    if (!teamId) return;\n\n    let frame = 0;`;
const newBlock = `    const teamId = getCaptainSquadTeamId(pathname);\n    if (!teamId) return;\n    const resolvedTeamId: string = teamId;\n\n    let frame = 0;`;

if (!source.includes("const resolvedTeamId: string = teamId;")) {
  if (!source.includes(oldBlock)) throw new Error("Captain bridge team-id anchor not found.");
  source = source.replace(oldBlock, newBlock);
  source = source.replace("installAdditionalCaptainForm(teamId);", "installAdditionalCaptainForm(resolvedTeamId);");
  fs.writeFileSync(full, source, "utf8");
  console.log("Fixed captured nullable captain team id for TypeScript build.");
} else {
  console.log("Captain bridge nullable team-id fix already applied.");
}
