const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const OLD_PRICE = ["£", "90"].join("");
const NEW_PRICE = "£70";

const kitOfferFiles = [
  "src/lib/kits/constants.ts",
  "src/app/captain/team/[teamid]/kit/page.tsx",
  "src/components/captain/TeamKitOrderForm.tsx",
  "src/components/captain/LegacyFreeKitOfferCopyBridge.tsx",
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
  "scripts/apply-founding-kit-package-copy.cjs",
  "scripts/apply-legacy-free-kit-captain-copy.cjs",
  "scripts/apply-legacy-free-kit-linebreak-fix.cjs",
];

const quantityReplacements = [
  ["export const TEAM_KIT_QUANTITY = 9;", "export const TEAM_KIT_QUANTITY = 7;"],
  [/\bNine\b/g, "Seven"],
  [/\bnine\b/g, "seven"],
  [/\b9 complete kits\b/g, "7 complete kits"],
  [/\b9 shirts\b/g, "7 shirts"],
  [/\b9 pairs\b/g, "7 pairs"],
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

function isTextSource(filePath) {
  return /\.(?:ts|tsx|js|jsx|cjs|mjs|md|json)$/i.test(filePath);
}

// Price is a single £70 total throughout the whole application. This broad pass
// prevents an older build-time wording helper from reintroducing £90 on a screen
// that was not listed in the original seven-kit conversion.
const priceFiles = [
  ...walk(path.join(root, "src")),
  ...walk(path.join(root, "scripts")),
  ...walk(path.join(root, "docs")),
].filter(isTextSource);

for (const absolutePath of priceFiles) {
  const before = fs.readFileSync(absolutePath, "utf8");
  const after = before.split(OLD_PRICE).join(NEW_PRICE);

  if (after !== before) {
    fs.writeFileSync(absolutePath, after, "utf8");
  }
}

// The £70 package contains seven kits at £10 per shirt. Keep all related
// quantities aligned across public pages, registration, admin and captain tools.
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

const remainingOldPriceFiles = [
  ...walk(path.join(root, "src")),
  ...walk(path.join(root, "scripts")),
  ...walk(path.join(root, "docs")),
]
  .filter(isTextSource)
  .filter((filePath) => fs.readFileSync(filePath, "utf8").includes(OLD_PRICE));

if (remainingOldPriceFiles.length > 0) {
  throw new Error(
    `Old £90 kit wording remains in: ${remainingOldPriceFiles
      .map((filePath) => path.relative(root, filePath))
      .join(", ")}`,
  );
}

require("./apply-player-dashboard-kit-card.cjs");

console.log(
  "Applied seven-kit founding offer across all screens: seven kits at £10 each (£70 total), with a permanent player dashboard kit card.",
);
