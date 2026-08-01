const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const layoutPath = "src/app/captain/team/[teamid]/layout.tsx";
const absolutePath = path.join(root, layoutPath);
let source = fs.readFileSync(absolutePath, "utf8");

const importLine =
  'import LegacyFreeKitOfferCopyBridge from "@/components/captain/LegacyFreeKitOfferCopyBridge";';

if (!source.includes(importLine)) {
  const anchor =
    'import CaptainRedirectErrorNoticeFix from "@/components/captain/CaptainRedirectErrorNoticeFix";';

  if (!source.includes(anchor)) {
    throw new Error(`Expected captain layout import anchor was not found in ${layoutPath}`);
  }

  source = source.replace(anchor, `${anchor}\n${importLine}`);
}

if (!source.includes("      <LegacyFreeKitOfferCopyBridge />")) {
  const anchor = "      <CaptainRedirectErrorNoticeFix />";

  if (!source.includes(anchor)) {
    throw new Error(`Expected captain layout render anchor was not found in ${layoutPath}`);
  }

  source = source.replace(
    anchor,
    `${anchor}\n      <LegacyFreeKitOfferCopyBridge />`,
  );
}

fs.writeFileSync(absolutePath, source, "utf8");
console.log("Mounted legacy free-kit wording bridge in the captain layout.");
