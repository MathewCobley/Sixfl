const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceOnce(filePath, before, after, label) {
  let source = read(filePath);
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${filePath}`);
  }
  source = source.replace(before, after);
  write(filePath, source);
}

const layoutPath = "src/app/captain/team/[teamid]/layout.tsx";
const actionsPath = "src/app/captain/team/[teamid]/player-payments/actions.ts";

replaceOnce(
  layoutPath,
  'import CaptainViewModeHeader from "@/components/captain/CaptainViewModeHeader";',
  [
    'import CaptainViewModeHeader from "@/components/captain/CaptainViewModeHeader";',
    'import ZeroFeePlayerAdjustmentBridge from "@/components/captain/ZeroFeePlayerAdjustmentBridge";',
  ].join("\n"),
  "zero-fee adjustment bridge import",
);

replaceOnce(
  layoutPath,
  "      <CaptainRedirectErrorNoticeFix />",
  [
    "      <CaptainRedirectErrorNoticeFix />",
    "      <ZeroFeePlayerAdjustmentBridge />",
  ].join("\n"),
  "zero-fee adjustment bridge render",
);

replaceOnce(
  actionsPath,
  'import { prisma } from "@/lib/prisma";',
  [
    'import { reconcileZeroFeePlayerAdjustmentsForFixture } from "@/lib/payments/zero-fee-player-adjustments";',
    'import { prisma } from "@/lib/prisma";',
  ].join("\n"),
  "zero-fee reconciliation import",
);

replaceOnce(
  actionsPath,
  "  await syncTeamChargeForZeroFeeWaivers({ teamId, fixtureId });",
  "  await reconcileZeroFeePlayerAdjustmentsForFixture({ teamId, fixtureId });",
  "zero-fee reconciliation call",
);

console.log(
  "Mounted zero-fee player details and changed charge reconciliation to use current player overrides.",
);
