const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, source) => fs.writeFileSync(path.join(root, file), source, "utf8");

const launcherPath = "src/components/captain/TemporaryPlayerPassLauncher.tsx";
let launcher = read(launcherPath);

launcher = launcher.replace(
  '  const captainMatch = pathname.match(/^\\/captain\\/team\\/([^/]+)\\/match-fees\\/?$/);',
  '  const captainMatch = pathname.match(/^\\/captain\\/team\\/([^/]+)\\/(?:match-fees|player-payments)\\/?$/);',
);

if (!launcher.includes('(?:match-fees|player-payments)')) {
  throw new Error("Temporary-player launcher was not extended to squad payments.");
}
write(launcherPath, launcher);

const paymentPagePath = "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";
let paymentPage = read(paymentPagePath);

paymentPage = paymentPage.replace(
  'import { notFound } from "next/navigation";',
  'import { notFound, redirect } from "next/navigation";',
);

const redirectMarker = `  const selectedFixture =\n    (sp.fixtureId ? fixtureById.get(sp.fixtureId) ?? null : null) ??\n    (selectedLedgerEntry?.fixtureId\n      ? fixtureById.get(selectedLedgerEntry.fixtureId) ?? null\n      : null) ??\n    fixtures[0] ??\n    null;`;

const redirectReplacement = `${redirectMarker}\n\n  // Keep the selected fixture in the URL so fixture-scoped controls, including\n  // temporary-player acceptance, always know exactly which match they act on.\n  if (!sp.fixtureId && selectedFixture) {\n    redirect(\n      \`/captain/team/\${teamid}/player-payments?fixtureId=\${encodeURIComponent(selectedFixture.id)}\`,\n    );\n  }`;

if (!paymentPage.includes("temporary-player acceptance")) {
  if (!paymentPage.includes(redirectMarker)) {
    throw new Error("Could not find selected fixture block on squad payments page.");
  }
  paymentPage = paymentPage.replace(redirectMarker, redirectReplacement);
}

if (!paymentPage.includes('import { notFound, redirect } from "next/navigation";')) {
  throw new Error("Squad payments redirect import was not applied.");
}
write(paymentPagePath, paymentPage);

console.log("Temporary-player controls now recognise fixture-scoped squad payments and the selected fixture is canonicalised into the URL.");
