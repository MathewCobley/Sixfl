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

// These panels used to be inserted beside the top-level client bridges, which put
// them above the team identity card and navigation. Remove any previous placement
// and mount them inside the main content area after the persistent team header/nav.
layoutSource = layoutSource
  .replaceAll("      <LegacyFreeKitOfferCopyBridge />\n", "")
  .replaceAll("      <StandardTeamKitCopyBridge />\n", "")
  .replaceAll("          <LegacyFreeKitOfferCopyBridge />\n", "")
  .replaceAll("          <StandardTeamKitCopyBridge />\n", "");

const contentAnchor = "          <CaptainSupportPanel teamId={team.id} />";
if (!layoutSource.includes(contentAnchor)) {
  throw new Error(`Expected captain main-content anchor was not found in ${layoutPath}`);
}

layoutSource = layoutSource.replace(
  contentAnchor,
  [
    contentAnchor,
    "          <LegacyFreeKitOfferCopyBridge />",
    "          <StandardTeamKitCopyBridge />",
  ].join("\n"),
);

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

// The bridges now live inside the captain main container, so they should fill that
// content width rather than creating a second page-width container of their own.
legacySource = legacySource.replace(
  '    <div className="mx-auto mb-2 mt-4 w-[calc(100%-1.5rem)] max-w-[1400px] space-y-4 sm:w-[calc(100%-5rem)]">',
  '    <div className="w-full space-y-4">',
);
fs.writeFileSync(legacyBridgeAbsolutePath, legacySource, "utf8");

const standardPanelPath =
  "src/components/captain/StandardKitPaymentPanel.tsx";
const standardPanelAbsolutePath = path.join(root, standardPanelPath);
if (fs.existsSync(standardPanelAbsolutePath)) {
  let standardPanelSource = fs.readFileSync(standardPanelAbsolutePath, "utf8");
  standardPanelSource = standardPanelSource.replace(
    '    <section className="mx-auto mb-2 mt-4 w-[calc(100%-1.5rem)] max-w-[1400px] rounded-3xl border border-sky-400/25 bg-sky-500/[0.08] p-5 sm:w-[calc(100%-5rem)] sm:p-6">',
    '    <section className="w-full rounded-3xl border border-sky-400/25 bg-sky-500/[0.08] p-5 sm:p-6">',
  );
  fs.writeFileSync(standardPanelAbsolutePath, standardPanelSource, "utf8");
}

if (
  layoutSource.indexOf("<header className=\"captain-team-header") >
    layoutSource.indexOf("<LegacyFreeKitOfferCopyBridge") ||
  layoutSource.indexOf("<header className=\"captain-team-header") >
    layoutSource.indexOf("<StandardTeamKitCopyBridge")
) {
  throw new Error("Kit payment panels must remain below the captain team header and navigation.");
}

console.log(
  "Mounted kit pricing and payment panels below the persistent captain team card and navigation.",
);
