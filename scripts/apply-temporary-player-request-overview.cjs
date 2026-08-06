const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const nudgePath = path.join(
  root,
  "src",
  "components",
  "captain",
  "CaptainTeamNudges.tsx",
);

if (!fs.existsSync(nudgePath)) {
  throw new Error("CaptainTeamNudges.tsx was not found.");
}

let source = fs.readFileSync(nudgePath, "utf8");

source = source.replaceAll(
  'import CaptainPlayerPaymentLinkSummary from "@/components/captain/CaptainPlayerPaymentLinkSummary";\n',
  "",
);

const temporaryImport =
  'import CaptainTemporaryPlayerRequestSummary from "@/components/captain/CaptainTemporaryPlayerRequestSummary";';
if (!source.includes(temporaryImport)) {
  const anchor =
    'import CaptainFixtureConfirmButton from "@/components/captain/CaptainFixtureConfirmButton";';
  if (!source.includes(anchor)) {
    throw new Error("Captain fixture confirm import anchor was not found.");
  }
  source = source.replace(anchor, `${anchor}\n${temporaryImport}`);
}

source = source.replaceAll(
  "      <CaptainPlayerPaymentLinkSummary teamId={teamId} />",
  "      <CaptainTemporaryPlayerRequestSummary teamId={teamId} />",
);

if (!source.includes("<CaptainTemporaryPlayerRequestSummary teamId={teamId} />")) {
  const fixtureBlockEnd = "      ) : null}\n\n      {showRatingsNudge || showKitNudge ? (";
  if (!source.includes(fixtureBlockEnd)) {
    throw new Error("Captain overview nudge insertion point was not found.");
  }
  source = source.replace(
    fixtureBlockEnd,
    `      ) : null}\n\n      <CaptainTemporaryPlayerRequestSummary teamId={teamId} />\n\n      {showRatingsNudge || showKitNudge ? (`,
  );
}

if (
  source.includes("CaptainPlayerPaymentLinkSummary") ||
  !source.includes(temporaryImport) ||
  !source.includes("<CaptainTemporaryPlayerRequestSummary teamId={teamId} />")
) {
  throw new Error("Temporary-player overview replacement did not complete.");
}

fs.writeFileSync(nudgePath, source, "utf8");
console.log(
  "Captain overview now shows incoming temporary-player requests instead of ordinary player-payment delivery history.",
);
