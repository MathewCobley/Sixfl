const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const layoutPath = "src/app/captain/team/[teamid]/layout.tsx";
const layoutAbsolutePath = path.join(root, layoutPath);
let layoutSource = fs.readFileSync(layoutAbsolutePath, "utf8");

layoutSource = layoutSource
  .replaceAll(
    'import LegacyFreeKitOfferCopyBridge from "@/components/captain/LegacyFreeKitOfferCopyBridge";\n',
    "",
  )
  .replaceAll(
    'import StandardTeamKitCopyBridge from "@/components/captain/StandardTeamKitCopyBridge";\n',
    "",
  )
  .replaceAll("      <LegacyFreeKitOfferCopyBridge />\n", "")
  .replaceAll("      <StandardTeamKitCopyBridge />\n", "")
  .replaceAll("          <LegacyFreeKitOfferCopyBridge />\n", "")
  .replaceAll("          <StandardTeamKitCopyBridge />\n", "");

fs.writeFileSync(layoutAbsolutePath, layoutSource, "utf8");

if (
  layoutSource.includes("LegacyFreeKitOfferCopyBridge") ||
  layoutSource.includes("StandardTeamKitCopyBridge")
) {
  throw new Error("Legacy team-kit copy bridges are still mounted in the captain layout.");
}

console.log(
  "Removed the legacy team-kit layout bridges; kit offer UI is rendered by the kit page itself.",
);
