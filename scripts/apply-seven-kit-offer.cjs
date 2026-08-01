const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const files = [
  "src/lib/kits/constants.ts",
  "src/app/captain/team/[teamid]/kit/page.tsx",
  "src/components/captain/TeamKitOrderForm.tsx",
  "src/components/captain/LegacyFreeKitOfferCopyBridge.tsx",
  "src/app/(public)/founding-team-kit-terms/page.tsx",
  "src/app/(public)/founding-teams/page.tsx",
  "src/app/(public)/league-agreement/page.tsx",
  "src/components/layout/SiteFooter.tsx",
  "src/components/admin/teams/FreeKitTeamBadgesBridge.tsx",
  "scripts/apply-founding-kit-package-copy.cjs",
  "scripts/apply-legacy-free-kit-captain-copy.cjs",
  "scripts/apply-legacy-free-kit-linebreak-fix.cjs",
];

const replacements = [
  ["export const TEAM_KIT_QUANTITY = 9;", "export const TEAM_KIT_QUANTITY = 7;"],
  ["£90 Founding Team Kit Package", "£70 Founding Team Kit Package"],
  ["£90 kit package", "£70 kit package"],
  ["£90 contribution", "£70 contribution"],
  ["£90 per team", "£70 per team"],
  ["£90 payment", "£70 payment"],
  ["£90 in total", "£70 in total"],
  ["Submit £90 kit package", "Submit £70 kit package"],
  ["No £90 contribution", "No £70 contribution"],
  ["new £90 contribution", "new £70 contribution"],
  ["nine complete kits", "seven complete kits"],
  ["nine-kit order", "seven-kit order"],
  ["nine-kit package", "seven-kit package"],
  ["nine personalised shirts", "seven personalised shirts"],
  ["nine shirts", "seven shirts"],
  ["all nine kits", "all seven kits"],
  ["Personalise all nine kits", "Personalise all seven kits"],
  ["One design will be used for all nine kits", "One design will be used for all seven kits"],
  ["Each of the nine shirts", "Each of the seven shirts"],
  ["Your nine-kit order", "Your seven-kit order"],
  ["original nine-kit order", "original seven-kit order"],
  ["this nine-kit order", "this seven-kit order"],
  ["package of nine", "package of seven"],
];

for (const filePath of files) {
  const absolutePath = path.join(root, filePath);
  if (!fs.existsSync(absolutePath)) continue;

  let source = fs.readFileSync(absolutePath, "utf8");
  const before = source;

  for (const [from, to] of replacements) {
    source = source.split(from).join(to);
  }

  if (source !== before) {
    fs.writeFileSync(absolutePath, source, "utf8");
  }
}

const constants = fs.readFileSync(path.join(root, "src/lib/kits/constants.ts"), "utf8");
if (!constants.includes("export const TEAM_KIT_QUANTITY = 7;")) {
  throw new Error("The team kit quantity was not changed to seven.");
}

console.log("Applied seven-kit founding offer: seven kits at £10 each (£70 total).");
