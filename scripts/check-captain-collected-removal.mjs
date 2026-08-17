import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function expect(source, marker, message) {
  if (!source.includes(marker)) failures.push(message);
}

const panelPath = "src/components/captain/CaptainCollectedRemittancePanel.tsx";
const routePath = "src/app/captain/team/[teamid]/payments/remove-collected/route.ts";
const remittancePath = "src/lib/payments/captain-collected-remittance.ts";

const panel = read(panelPath);
const route = read(routePath);
const remittance = read(remittancePath);

expect(panel, "Remove from captain collection", "Captain payments must expose the removal action.");
expect(panel, "sorted that money out between yourselves", "Captain payments must explain when removal should be used.");
expect(panel, "remittedPence === 0", "The UI must hide removal after money has reached SIXFL.");
expect(panel, "!hasPendingCheckout", "The UI must hide removal while Stripe checkout is pending.");
expect(panel, "Previously removed from captain collection", "Removed collections must stay visible in audit history.");
expect(panel, "did not reduce the fixture balance", "Audit history must say removal does not reduce the fixture balance.");

expect(route, "snapshot.pendingPence > 0", "Server must block removal while Stripe checkout is pending.");
expect(route, "snapshot.remittedPence > 0", "Server must block removal after money has reached SIXFL.");
expect(route, "CAPTAIN_COLLECTION_REMOVED_NOTE_MARKER", "Server must append an auditable private-resolution marker.");
expect(route, "Captain and player resolved this privately", "Server audit must record the private resolution reason.");
expect(route, "the SIXFL fixture balance was not reduced", "Server audit must preserve the fixture-balance meaning.");

expect(remittance, "isCaptainCollectionActiveNote", "Captain-collected totals must distinguish active from removed history.");
expect(remittance, "isCaptainCollectionRemovedNote", "Captain-collected totals must retain removed history.");
expect(remittance, "removedPence", "Captain-collected snapshots must expose removed amounts for audit display.");
expect(remittance, "removalNotes", "Captain-collected snapshots must expose the removal audit notes.");

if (route.includes("paymentCharge.update") || route.includes('UPDATE "PaymentCharge"')) {
  failures.push("Removing captain collection must never rewrite the fixture PaymentCharge.");
}

if (failures.length) {
  console.error("\nCAPTAIN COLLECTION REMOVAL CHECK FAILED\n");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log("Captain collection removal safeguards passed.");
