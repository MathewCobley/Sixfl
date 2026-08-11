const fs = require("node:fs");
const path = require("node:path");

const bridgePath = path.join(
  process.cwd(),
  "src/components/admin/leagues/LeagueFreeKitOfferBridge.tsx",
);
let source = fs.readFileSync(bridgePath, "utf8");

const startMarker = "  // Existing/submitted kit orders remain visible.";
const endMarker = "  return true;\n}\n\nasync function applyPublicLeagueOffer";

const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start >= 0 && end >= 0) {
  const replacement = [
    "  // Captain-facing kit pages never discuss whether an old allocation or offer",
    "  // exists. Pricing and available kit rows are shown directly by the kit page.",
    "  // Keep this bridge only as a cleanup guard for any legacy copy that survives",
    "  // an older build patch.",
    "  hideFreeOfferCopy();",
    "  return true;",
    "}",
    "",
    "async function applyPublicLeagueOffer",
  ].join("\n");
  source = source.slice(0, start) + replacement + source.slice(end + endMarker.length);
}

source = source.replaceAll(
  "The free kit offer has ended for this league. Complete additional kits remain available at the standard paid price.",
  "Complete kits are available from the team kit page.",
);

if (source.includes("The free kit offer has ended for this league")) {
  throw new Error("Captain kit offer-ended notice is still present.");
}

fs.writeFileSync(bridgePath, source, "utf8");
console.log("Captain kit pages no longer show or explain legacy kit-offer status.");
