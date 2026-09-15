// Compatibility only: the older standard-pay-per-kit preparation still writes
// these two functions. Delegate their final implementation to the native offer
// service, which owns the rule and is tested before and after full prebuild.
// Do not add business rules here. Re-running this adapter must be a no-op.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function delegate(filePath, name, implementation) {
  const absolutePath = path.join(root, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  if (source.includes(implementation)) return;
  // Both legacy generators emit a top-level function with a column-zero closing
  // brace. Match only that known block, never a broad whole-file rewrite. This
  // compatibility check also runs before dependencies have been installed.
  const signature = `async function ${name}(teamId: string) {`;
  const start = source.indexOf(signature);
  const end = start < 0 ? -1 : source.indexOf("\n}\n", start);
  if (start < 0 || end < 0 || source.indexOf(signature, start + signature.length) >= 0) {
    throw new Error(`Missing or ambiguous legacy kit adapter ${name} in ${filePath}`);
  }
  const next = source.slice(0, start) + implementation + source.slice(end + 2);
  fs.writeFileSync(absolutePath, next, "utf8");
}

delegate("src/lib/kits/extra-kit-quantity.ts", "getIncludedKitQuantity", `async function getIncludedKitQuantity(teamId: string) {
  const { getTeamFreeKitOffer } = await import("@/lib/kits/free-kit-offer");
  const offer = await getTeamFreeKitOffer(teamId);
  return offer?.includedEligible ? TEAM_KIT_QUANTITY : 0;
}`);

delegate("src/app/api/captain/team/[teamid]/extra-kit-payments/route.ts", "getKitEligibility", `async function getKitEligibility(teamId: string) {
  const { getTeamFreeKitOffer } = await import("@/lib/kits/free-kit-offer");
  const offer = await getTeamFreeKitOffer(teamId);
  return { eligible: Boolean(offer?.includedEligible), legacyOffer: Boolean(offer?.legacyOffer) };
}`);

console.log("Prepared kit pricing delegates to the native audited team offer service.");
