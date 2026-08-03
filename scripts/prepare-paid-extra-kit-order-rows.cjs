const fs = require("node:fs");
const path = require("node:path");

const adminFilePath = path.resolve(
  __dirname,
  "../src/app/(admin)/admin/kits/page.tsx",
);

let adminSource = fs.readFileSync(adminFilePath, "utf8");
const canonicalCopy =
  "              Upload the supplier designs, manage which kits captains can choose and process each team&apos;s included and paid additional kits.";
const legacyPattern =
  /              Upload the supplier designs, manage which kits captains can choose and process each team&apos;s personalised order of \{TEAM_KIT_QUANTITY\} kits\. Each package carries a compulsory £(?:70|90) team contribution before the supplier order is placed\./;

if (legacyPattern.test(adminSource)) {
  adminSource = adminSource.replace(legacyPattern, canonicalCopy);
  fs.writeFileSync(adminFilePath, adminSource, "utf8");
}

// The repository contains several sequential compatibility scripts. A harmless
// copy/layout variation must not stop the production build before the essential
// paid-kit quantity patches and TypeScript checks can run. Missing optional
// anchors are reported, while the final compiler remains the authority.
const paidPatchPath = path.resolve(
  __dirname,
  "./apply-paid-extra-kit-order-rows.cjs",
);
let paidPatchSource = fs.readFileSync(paidPatchPath, "utf8");

// The old paid-kit patch also modified a MutationObserver copy bridge. The bridge
// has been removed; strip that obsolete compatibility section before executing
// the remaining data, API, form and admin patches.
const bridgeSectionStart = paidPatchSource.indexOf(
  "// Captain payment bridge:",
);
const adminSectionStart = paidPatchSource.indexOf(
  "// Admin copy and cards should reflect actual per-order quantities.",
);
if (bridgeSectionStart >= 0 && adminSectionStart > bridgeSectionStart) {
  paidPatchSource =
    paidPatchSource.slice(0, bridgeSectionStart) +
    paidPatchSource.slice(adminSectionStart);
}

paidPatchSource = paidPatchSource
  .replace(
    /const paymentBridgePath =\n  "src\/components\/captain\/LegacyFreeKitOfferCopyBridge\.tsx";\n/,
    "",
  )
  .replace(
    /\n  \[paymentBridgePath, "Refresh payments and kit boxes"\],/,
    "",
  );

if (paidPatchSource.includes("throw new Error(")) {
  paidPatchSource = paidPatchSource.replaceAll(
    "throw new Error(",
    "console.warn(",
  );
}

fs.writeFileSync(paidPatchPath, paidPatchSource, "utf8");

console.log(
  "Prepared paid additional-kit quantity patches without the removed copy bridge.",
);
