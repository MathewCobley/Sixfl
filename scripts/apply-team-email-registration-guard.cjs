const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const file = "src/app/(public)/register-interest/actions.ts";
const absolute = path.join(root, ...file.split("/"));
let source = fs.readFileSync(absolute, "utf8");

const importAnchor = 'import { resolveProspectiveLeagueId } from "@/lib/leads/prospectiveLeague";';
const guardImport = `import {\n  buildTeamEmailConflictPath,\n  findTeamEmailRegistrationConflict,\n} from "@/lib/leads/team-email-registration-guard";`;

if (!source.includes('findTeamEmailRegistrationConflict')) {
  if (!source.includes(importAnchor)) {
    throw new Error("Register-interest team email guard import anchor not found.");
  }
  source = source.replace(importAnchor, `${importAnchor}\n${guardImport}`);
}

const leagueTypeAnchor =
  '  const leagueType = requiresLeagueType ? (leagueTypeRaw as LeagueType) : null;';
const guardBlock = `  if (interestType === "TEAM") {\n    const registrationConflict = await findTeamEmailRegistrationConflict({\n      email,\n      teamName,\n    });\n\n    if (registrationConflict) {\n      redirect(buildTeamEmailConflictPath(registrationConflict));\n    }\n  }\n\n`;

if (!source.includes('const registrationConflict = await findTeamEmailRegistrationConflict')) {
  if (!source.includes(leagueTypeAnchor)) {
    throw new Error("Register-interest team email guard insertion anchor not found.");
  }
  source = source.replace(leagueTypeAnchor, `${guardBlock}${leagueTypeAnchor}`);
}

if (
  !source.includes('findTeamEmailRegistrationConflict') ||
  !source.includes('redirect(buildTeamEmailConflictPath(registrationConflict))')
) {
  throw new Error("Register-interest team email registration guard was not applied.");
}

fs.writeFileSync(absolute, source, "utf8");
console.log("General team-interest registration now blocks duplicate/shared captain emails.");
