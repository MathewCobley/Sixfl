const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const saveV2Path = path.join(
  root,
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "kit",
  "save-v2.ts",
);

if (!fs.existsSync(saveV2Path)) {
  throw new Error("Native team kit save action is missing.");
}

let source = fs.readFileSync(saveV2Path, "utf8");

if (!source.includes('error: "extra_kits_pending_payment"')) {
  const before = [
    '  const intent = readString(formData, "intent");',
    '  const status = intent === "submit" ? "SUBMITTED" : "DRAFT";',
  ].join("\n");
  const after = [
    '  const intent = readString(formData, "intent");',
    '  if (intent === "submit" && paymentSummary.pendingExtraKitQuantity > 0) {',
    '    redirect(buildRedirect(teamId, { error: "extra_kits_pending_payment" }));',
    '  }',
    '  const status = intent === "submit" ? "SUBMITTED" : "DRAFT";',
  ].join("\n");

  if (!source.includes(before)) {
    throw new Error("Expected native kit submit status source was not found.");
  }
  source = source.replace(before, after);
}

if (!source.includes('paymentSummary.pendingExtraKitQuantity > 0')) {
  throw new Error("Pending extra-kit payment submit guard was not applied.");
}

fs.writeFileSync(saveV2Path, source, "utf8");
console.log(
  "Kit drafts remain saveable, but the server blocks submission while additional-kit payments are outstanding.",
);
