import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const migration = read(
  "prisma/migrations/20260829190000_allow_inactive_team_member_status/migration.sql",
);
const statusService = read("src/lib/managed-squad/squadStatus.ts");
const captainAction = read(
  "src/app/captain/team/[teamid]/squad/status-actions.ts",
);
const reminderJob = read(
  "src/app/api/jobs/managed-squad-availability-reminders/route.ts",
);
const packageJson = read("package.json");

expect(
  migration.includes(
    'DROP CONSTRAINT IF EXISTS "TeamMember_squadStatus_check"',
  ),
  "The legacy ACTIVE/INJURED-only squad-status constraint must be removed.",
);
expect(
  migration.includes(
    `CHECK ("squadStatus" IN ('ACTIVE', 'INJURED', 'INACTIVE'))`,
  ),
  "The persisted TeamMember squad-status contract must allow INACTIVE.",
);
expect(
  migration.includes(
    `"squadStatus" NOT IN ('ACTIVE', 'INJURED', 'INACTIVE')`,
  ),
  "Unexpected historic squad-status values must be repaired before the new constraint is installed.",
);
expect(
  packageJson.includes('"start": "prisma migrate deploy'),
  "Production startup must continue to deploy Prisma migrations before serving requests.",
);

expect(
  statusService.includes(
    'export type TeamMemberSquadStatus = "ACTIVE" | "INJURED" | "INACTIVE";',
  ),
  "The squad-status service must retain the inactive historic-player state.",
);
expect(
  !statusService.includes('ALTER TABLE "TeamMember"'),
  "Request handling must not run TeamMember ALTER TABLE statements.",
);
expect(
  statusService.includes(
    "owned by Prisma migrations; request handling must never run ALTER TABLE",
  ),
  "The compatibility helper must document that schema ownership moved to migrations.",
);
expect(
  statusService.includes('"squadStatus" = ${input.status}'),
  "The central squad-status service must continue to persist the selected status.",
);
expect(
  statusService.includes('input.status === "INACTIVE"'),
  "Inactive players must continue to receive future-activity cleanup.",
);

expect(
  captainAction.includes(
    'cleanText(value).toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE"',
  ),
  "Captains must continue to be able to choose inactive or active status.",
);
expect(
  captainAction.includes("updateCaptainSquadMemberActivityAction"),
  "The captain edit page must retain its player activity action.",
);

expect(
  reminderJob.includes(
    `"squadStatus" IN ('INJURED', 'INACTIVE')`,
  ),
  "Managed-squad availability reminders must exclude both injured and inactive players.",
);
expect(
  reminderJob.includes("skippedInactiveMembers"),
  "The managed-squad reminder job must report how many inactive players it excluded.",
);

if (failures.length > 0) {
  console.error("\nINACTIVE PLAYER STATUS STORAGE CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("Inactive player status storage contract passed.");
