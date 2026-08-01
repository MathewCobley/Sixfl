const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const layoutPath = "src/app/captain/team/[teamid]/layout.tsx";
const layoutAbsolutePath = path.join(root, layoutPath);
let layoutSource = fs.readFileSync(layoutAbsolutePath, "utf8");

const legacyImport =
  'import LegacyFreeKitOfferCopyBridge from "@/components/captain/LegacyFreeKitOfferCopyBridge";';
const standardImport =
  'import StandardTeamKitCopyBridge from "@/components/captain/StandardTeamKitCopyBridge";';
const importAnchor =
  'import CaptainRedirectErrorNoticeFix from "@/components/captain/CaptainRedirectErrorNoticeFix";';

if (!layoutSource.includes(legacyImport)) {
  if (!layoutSource.includes(importAnchor)) {
    throw new Error(`Expected captain layout import anchor was not found in ${layoutPath}`);
  }
  layoutSource = layoutSource.replace(importAnchor, `${importAnchor}\n${legacyImport}`);
}

if (!layoutSource.includes(standardImport)) {
  const anchor = layoutSource.includes(legacyImport) ? legacyImport : importAnchor;
  layoutSource = layoutSource.replace(anchor, `${anchor}\n${standardImport}`);
}

const renderAnchor = "      <CaptainRedirectErrorNoticeFix />";
if (!layoutSource.includes(renderAnchor)) {
  throw new Error(`Expected captain layout render anchor was not found in ${layoutPath}`);
}

if (!layoutSource.includes("      <LegacyFreeKitOfferCopyBridge />")) {
  layoutSource = layoutSource.replace(
    renderAnchor,
    `${renderAnchor}\n      <LegacyFreeKitOfferCopyBridge />`,
  );
}

if (!layoutSource.includes("      <StandardTeamKitCopyBridge />")) {
  const anchor = "      <LegacyFreeKitOfferCopyBridge />";
  layoutSource = layoutSource.replace(
    anchor,
    `${anchor}\n      <StandardTeamKitCopyBridge />`,
  );
}

fs.writeFileSync(layoutAbsolutePath, layoutSource, "utf8");

// The additional-kit payment bridge is available to every founding-package team,
// but its green "free kit" summary must only appear for genuine legacy free offers.
const legacyBridgePath =
  "src/components/captain/LegacyFreeKitOfferCopyBridge.tsx";
const legacyBridgeAbsolutePath = path.join(root, legacyBridgePath);
let legacySource = fs.readFileSync(legacyBridgeAbsolutePath, "utf8");

const freePanelStart =
  '      <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.08] p-5 sm:p-6">';
const extraPanelStart =
  '      <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-5 sm:p-6">';

if (!legacySource.includes("      {data.legacyOffer ? (")) {
  if (!legacySource.includes(freePanelStart)) {
    throw new Error(`Expected free-kit summary panel was not found in ${legacyBridgePath}`);
  }
  legacySource = legacySource.replace(
    freePanelStart,
    `      {data.legacyOffer ? (\n        ${freePanelStart.trim()}`,
  );

  const boundary = `      </section>\n\n${extraPanelStart}`;
  if (!legacySource.includes(boundary)) {
    throw new Error(`Expected free/additional-kit panel boundary was not found in ${legacyBridgePath}`);
  }
  legacySource = legacySource.replace(
    boundary,
    `        </section>\n      ) : null}\n\n${extraPanelStart}`,
  );
}

fs.writeFileSync(legacyBridgeAbsolutePath, legacySource, "utf8");

console.log(
  "Mounted free, founding-package and standard team-kit pricing in the captain layout.",
);
