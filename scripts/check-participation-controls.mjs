import fs from "node:fs";

const checks = [
  ["src/components/admin/AdminSidebar.tsx", "/admin/participation-controls"],
  ["src/app/(public)/claim/page.tsx", "getCaptainClaimRestriction"],
  ["src/lib/requireCaptain.ts", "getCaptainClaimRestriction"],
  ["src/lib/players/add-player-without-duplicates.ts", "PLAYING_RESTRICTED"],
  ["src/app/teams/join/[joinSlug]/actions.ts", "requires%20SIXFL%20admin%20review"],
  ["src/app/(admin)/admin/teams/[id]/page.tsx", "Participation controls"],
  ["src/app/(admin)/admin/participation-controls/page.tsx", "Possible re-formed blocked team"],
  ["src/app/(admin)/admin/participation-controls/actions.ts", "BLOCK_TEAM_REGISTRATION"],
  ["src/lib/participation/controls.ts", "BLOCKED_TEAM_OVERLAP_THRESHOLD"],
  ["prisma/migrations/20260822153000_participation_reentry_controls/migration.sql", "TeamMember_blocked_team_overlap_guard"],
  ["prisma/migrations/20260822153100_enforce_participation_restrictions/migration.sql", "FixtureSelection_participation_restriction_guard"],
];

for (const [file, marker] of checks) {
  const contents = fs.readFileSync(file, "utf8");
  if (!contents.includes(marker)) {
    throw new Error(`Participation control contract missing ${marker} in ${file}`);
  }
}

console.log("Participation control contract passed.");
