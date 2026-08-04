const fs = require("node:fs");
const path = require("node:path");

// Keep the database/client fields available while the captain-facing badge stage
// is held back from this deployment. The paid-extra-kit recovery must deploy on
// its own rather than being blocked by an unrelated layout patch.
const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
if (!fs.existsSync(schemaPath)) {
  throw new Error("Prisma schema is missing.");
}

let schema = fs.readFileSync(schemaPath, "utf8");
const teamModelStart = schema.indexOf("model Team {");
const nextModelStart = schema.indexOf("\nmodel ", teamModelStart + 1);
if (teamModelStart < 0 || nextModelStart < 0) {
  throw new Error("Team model could not be located in Prisma schema.");
}

let teamModel = schema.slice(teamModelStart, nextModelStart);
if (!teamModel.includes("kitBadgeConfirmedAt")) {
  const logoMatch = teamModel.match(/  logoUrl\s+String\?/);
  if (!logoMatch) throw new Error("Team logoUrl field could not be located.");

  teamModel = teamModel.replace(
    logoMatch[0],
    [
      logoMatch[0],
      "",
      "  kitBadgeConfirmedAt       DateTime?",
      "  kitBadgeChangeRequestedAt DateTime?",
      "  kitBadgeChangeRequestNote String?",
    ].join("\n"),
  );
}

if (!teamModel.includes("@@index([kitBadgeChangeRequestedAt])")) {
  const closingBrace = teamModel.lastIndexOf("}");
  if (closingBrace < 0) throw new Error("Team model closing brace was not found.");
  teamModel =
    teamModel.slice(0, closingBrace) +
    "  @@index([kitBadgeChangeRequestedAt])\n" +
    teamModel.slice(closingBrace);
}

schema = schema.slice(0, teamModelStart) + teamModel + schema.slice(nextModelStart);
fs.writeFileSync(schemaPath, schema, "utf8");

console.log(
  "Badge review schema fields prepared; captain badge UI is isolated from the paid-kit recovery deployment.",
);
