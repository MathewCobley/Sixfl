const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionsPath = path.join(
  root,
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "player-payments",
  "actions.ts",
);

if (!fs.existsSync(actionsPath)) {
  throw new Error("Captain player-payment actions file not found.");
}

let source = fs.readFileSync(actionsPath, "utf8");
const resendMarker =
  "export async function resendCaptainPlayerPaymentLinkAction(formData: FormData) {";
const createMarker =
  "export async function createCaptainSquadPaymentCollectionAction(formData: FormData) {";

const resendStart = source.indexOf(resendMarker);
const createStart = source.indexOf(createMarker);

// The legacy safety patch expects the collection-create action to follow the
// email helper directly. Keep the new manual-resend action, but move it after
// the create action during source preparation so the established payment safety
// patch can still compose normally. This is intentionally idempotent.
if (resendStart >= 0 && createStart > resendStart) {
  const resendBlock = source.slice(resendStart, createStart).trim();
  const beforeResend = source.slice(0, resendStart).trimEnd();
  const createAndRest = source.slice(createStart).trim();

  source = `${beforeResend}\n\n${createAndRest}\n\n${resendBlock}\n`;
  fs.writeFileSync(actionsPath, source, "utf8");
  console.log("Moved standard-team payment resend action after collection creation for prebuild compatibility.");
} else {
  console.log("Standard-team payment resend prebuild compatibility already satisfied.");
}
