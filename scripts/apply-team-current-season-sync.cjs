const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "teams",
  "actions.ts",
);

if (!fs.existsSync(filePath)) {
  console.warn("Team current-season sync patch skipped: actions file not found.");
  process.exit(0);
}

let source = fs.readFileSync(filePath, "utf8");
let changed = false;

if (!source.includes('import { randomUUID } from "node:crypto";')) {
  source = source.replace(
    '"use server";\n',
    '"use server";\n\nimport { randomUUID } from "node:crypto";\n',
  );
  changed = true;
}

if (!source.includes("  Prisma,")) {
  source = source.replace(
    "  NotificationRecipientSourceType,\n",
    "  NotificationRecipientSourceType,\n  Prisma,\n",
  );
  changed = true;
}

const marker = "  await upsertTeamNotificationRecipient(id);";
const syncBlock = `  // The Primary/current season field is authoritative for active participation.\n  // Affiliated-only status is managed separately from the league season team list.\n  if (leagueId) {\n    await prisma.$executeRaw(Prisma.sql\`\n      INSERT INTO \"LeagueSeasonTeam\" (\n        \"id\", \"leagueId\", \"teamId\", \"divisionId\", \"isActive\", \"createdAt\", \"updatedAt\"\n      )\n      VALUES (\n        \${randomUUID()}, \${leagueId}, \${id}, NULL, true, NOW(), NOW()\n      )\n      ON CONFLICT (\"leagueId\", \"teamId\") DO UPDATE\n      SET \"isActive\" = true, \"updatedAt\" = NOW()\n    \`);\n\n    await prisma.$executeRaw(Prisma.sql\`\n      UPDATE \"LeagueSeasonTeam\"\n      SET \"isActive\" = false, \"divisionId\" = NULL, \"updatedAt\" = NOW()\n      WHERE \"teamId\" = \${id}\n        AND \"leagueId\" <> \${leagueId}\n    \`);\n  } else {\n    await prisma.$executeRaw(Prisma.sql\`\n      UPDATE \"LeagueSeasonTeam\"\n      SET \"isActive\" = false, \"divisionId\" = NULL, \"updatedAt\" = NOW()\n      WHERE \"teamId\" = \${id}\n    \`);\n  }\n\n${marker}`;

if (!source.includes("The Primary/current season field is authoritative")) {
  source = source.replace(marker, syncBlock);
  changed = true;
}

if (changed) {
  fs.writeFileSync(filePath, source);
  console.log("Applied team current-season membership sync.");
} else {
  console.log("Team current-season membership sync already applied.");
}
