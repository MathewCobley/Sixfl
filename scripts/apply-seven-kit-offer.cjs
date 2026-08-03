const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const kitOfferFiles = [
  "src/lib/kits/constants.ts",
  "src/app/captain/team/[teamid]/kit/page.tsx",
  "src/components/captain/TeamKitOrderForm.tsx",
  "src/components/captain/IncludedKitPaymentPanel.tsx",
  "src/app/(public)/founding-team-kit-terms/page.tsx",
  "src/app/(public)/founding-teams/page.tsx",
  "src/app/(public)/league-agreement/page.tsx",
  "src/app/(public)/register-interest/page.tsx",
  "src/app/(public)/register-interest/actions.ts",
  "src/app/(public)/register-team/actions.ts",
  "src/app/(admin)/admin/leads/[id]/page.tsx",
  "src/app/(admin)/admin/leads/page.tsx",
  "src/app/(admin)/admin/leads/actions.ts",
  "src/app/(admin)/admin/teams/free-kit/page.tsx",
  "src/app/(admin)/admin/kits/page.tsx",
  "src/components/admin/leads/ManualLeadForm.tsx",
  "src/components/admin/teams/FreeKitTeamBadgesBridge.tsx",
  "src/components/layout/SiteFooter.tsx",
];

const quantityReplacements = [
  ["export const TEAM_KIT_QUANTITY = 9;", "export const TEAM_KIT_QUANTITY = 7;"],
  [/\bNine\b/g, "Seven"],
  [/\bnine\b/g, "seven"],
  [/\b9 complete kits\b/g, "7 complete kits"],
  [/\b9 shirts\b/g, "7 shirts"],
  [/\b9 pairs\b/g, "7 pairs"],
];

for (const filePath of kitOfferFiles) {
  const absolutePath = path.join(root, filePath);
  if (!fs.existsSync(absolutePath)) continue;

  let source = fs.readFileSync(absolutePath, "utf8");
  const before = source;

  for (const [from, to] of quantityReplacements) {
    source = source.replace(from, to);
  }

  if (source !== before) {
    fs.writeFileSync(absolutePath, source, "utf8");
  }
}

const constants = fs.readFileSync(
  path.join(root, "src/lib/kits/constants.ts"),
  "utf8",
);
if (!constants.includes("export const TEAM_KIT_QUANTITY = 7;")) {
  throw new Error("The team kit quantity was not changed to seven.");
}

require("./apply-player-dashboard-kit-card.cjs");

console.log(
  "Applied the seven-complete-kits offer quantity without adding any printing charge.",
);
