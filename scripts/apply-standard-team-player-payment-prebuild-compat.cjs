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
const pagePath = path.join(
  root,
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "player-payments",
  "PaymentPageServer.tsx",
);
const modernPagePatchPath = path.join(
  root,
  "scripts",
  "apply-modern-captain-player-payment-page.cjs",
);

if (!fs.existsSync(actionsPath) || !fs.existsSync(pagePath)) {
  throw new Error("Captain player-payment source files not found.");
}

let actions = fs.readFileSync(actionsPath, "utf8");
const resendMarker =
  "export async function resendCaptainPlayerPaymentLinkAction(formData: FormData) {";
const createMarker =
  "export async function createCaptainSquadPaymentCollectionAction(formData: FormData) {";

const resendStart = actions.indexOf(resendMarker);
const createStart = actions.indexOf(createMarker);

// The legacy safety patch expects the collection-create action to follow the
// email helper directly. Keep the new manual-resend action, but move it after
// the create action during source preparation so the established payment safety
// patch can still compose normally. This is intentionally idempotent.
if (resendStart >= 0 && createStart > resendStart) {
  const resendBlock = actions.slice(resendStart, createStart).trim();
  const beforeResend = actions.slice(0, resendStart).trimEnd();
  const createAndRest = actions.slice(createStart).trim();

  actions = `${beforeResend}\n\n${createAndRest}\n\n${resendBlock}\n`;
  fs.writeFileSync(actionsPath, actions, "utf8");
  console.log("Moved standard-team payment resend action after collection creation for prebuild compatibility.");
} else {
  console.log("Standard-team payment resend prebuild compatibility already satisfied.");
}

let page = fs.readFileSync(pagePath, "utf8");
const combinedActionImport = [
  'import {',
  '  createCaptainSquadPaymentCollectionAction,',
  '  resendCaptainPlayerPaymentLinkAction,',
  '} from "./actions";',
].join("\n");
const splitActionImports = [
  'import { resendCaptainPlayerPaymentLinkAction } from "./actions";',
  'import { createCaptainSquadPaymentCollectionAction } from "./actions";',
].join("\n");

// Let the established safety patch add its close-collection action to the
// create-action import while preserving the new resend action separately.
if (page.includes(combinedActionImport)) {
  page = page.replace(combinedActionImport, splitActionImports);
}

const resentSavedBlock = [
  '  if (saved === "payment_link_resent") {',
  '    return "Payment link email queued again for this player.";',
  '  }',
].join("\n");
const resentAndClosedSavedBlock = [
  resentSavedBlock,
  '',
  '  if (saved === "collection_closed") {',
  '    return "Unpaid player links were closed and can no longer be used.";',
  '  }',
].join("\n");

if (
  page.includes('function messageForSaved(saved?: string, emailsQueuedRaw?: string)') &&
  page.includes(resentSavedBlock) &&
  !page.includes('saved === "collection_closed"')
) {
  page = page.replace(resentSavedBlock, resentAndClosedSavedBlock);
}

fs.writeFileSync(pagePath, page, "utf8");

// The modern-page compatibility script predates the richer saved-message
// function above. Teach it to recognise that native implementation instead of
// treating it as a missing legacy anchor.
if (fs.existsSync(modernPagePatchPath)) {
  let patchSource = fs.readFileSync(modernPagePatchPath, "utf8");
  const oldGuard = [
    '  if (!source.includes(before)) {',
    '    throw new Error(`Expected ${label} source was not found in ${pagePath}`);',
    '  }',
  ].join("\n");
  const newGuard = [
    '  if (!source.includes(before)) {',
    '    if (',
    '      label === "modern collection saved messages" &&',
    '      source.includes("function messageForSaved(saved?: string, emailsQueuedRaw?: string)") &&',
    '      source.includes(\'saved === "collection_closed"\')',
    '    ) {',
    '      return;',
    '    }',
    '    throw new Error(`Expected ${label} source was not found in ${pagePath}`);',
    '  }',
  ].join("\n");

  if (!patchSource.includes(newGuard)) {
    if (!patchSource.includes(oldGuard)) {
      throw new Error("Modern captain payment-page compatibility guard not found.");
    }
    patchSource = patchSource.replace(oldGuard, newGuard);
    fs.writeFileSync(modernPagePatchPath, patchSource, "utf8");
  }
}

console.log("Prepared standard-team payment-link changes for the full production prebuild chain.");
