const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const absolutePath = path.join(root, pagePath);
let source = fs.readFileSync(absolutePath, "utf8");

const replacements = [
  {
    label: "legacy submitted-order message",
    before:
      '          {isLegacyFreeKitOffer\\n            ? "Your original free-kit order has been submitted to SIXFL. It is now locked while we review it. No £90 contribution applies to this order."\\n            : "Your nine-kit order has been submitted to SIXFL. It is now locked while we review it. The £90 contribution must be paid before the supplier order is placed."}',
    after: [
      "          {isLegacyFreeKitOffer",
      '            ? "Your original free-kit order has been submitted to SIXFL. It is now locked while we review it. No £90 contribution applies to this order."',
      '            : "Your nine-kit order has been submitted to SIXFL. It is now locked while we review it. The £90 contribution must be paid before the supplier order is placed."}',
    ].join("\n"),
  },
  {
    label: "legacy locked-order message",
    before:
      '            {isLegacyFreeKitOffer\\n              ? "The details below are read-only while SIXFL checks and places your original free-kit order. Contact us if anything needs changing before production begins."\\n              : "The details below are read-only while SIXFL checks the order and arranges the £90 payment. Contact us if anything needs changing before production begins."}',
    after: [
      "            {isLegacyFreeKitOffer",
      '              ? "The details below are read-only while SIXFL checks and places your original free-kit order. Contact us if anything needs changing before production begins."',
      '              : "The details below are read-only while SIXFL checks the order and arranges the £90 payment. Contact us if anything needs changing before production begins."}',
    ].join("\n"),
  },
];

for (const { label, before, after } of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${pagePath}`);
  }
  source = source.replace(before, after);
}

if (/isLegacyFreeKitOffer\\n/.test(source)) {
  throw new Error("Literal legacy-offer line breaks remain in the captain kit page.");
}

fs.writeFileSync(absolutePath, source, "utf8");
console.log("Repaired legacy free-kit captain copy line breaks.");
