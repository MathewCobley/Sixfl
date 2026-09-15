const fs = require("node:fs");
const path = require("node:path");

// Keep the existing Team Messages Cup integration authoritative, then add the
// deliberately non-recording test-send path on top of its prepared source.
require("./apply-team-message-template-scope.cjs");

const messagesPagePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "messages",
  "page.tsx",
);
const bulkActionsPath = path.join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "communications",
  "team-bulk-actions.ts",
);
const composerPath = path.join(
  process.cwd(),
  "src",
  "components",
  "admin",
  "communications",
  "TeamCommunicationsComposer.tsx",
);

for (const target of [messagesPagePath, bulkActionsPath, composerPath]) {
  if (!fs.existsSync(target)) {
    throw new Error(`Cup test-email source target not found: ${target}`);
  }
}

function replaceRequired(source, anchor, replacement, description) {
  if (!source.includes(anchor)) {
    throw new Error(`Could not find ${description}.`);
  }
  return source.replace(anchor, replacement);
}

// ---------------------------------------------------------------------------
// Mark Cup templates in the data already supplied to the Team composer.
// ---------------------------------------------------------------------------
let page = fs.readFileSync(messagesPagePath, "utf8");
let pageChanged = false;

if (!page.includes("isCupTemplate: requiresCup")) {
  page = replaceRequired(
    page,
    "      body: requiresCup ? resolveCupPreview(template.body) : template.body,\n      description: template.description,",
    "      body: requiresCup ? resolveCupPreview(template.body) : template.body,\n      isCupTemplate: requiresCup,\n      description: template.description,",
    "Cup template flag in Admin Messages",
  );
  pageChanged = true;
}

if (pageChanged) {
  fs.writeFileSync(messagesPagePath, page, "utf8");
  console.log("Admin Messages now marks Cup templates for explicit test sends.");
} else {
  console.log("Admin Messages Cup test template flag already applied.");
}

// ---------------------------------------------------------------------------
// Route only an explicit test-button submit through the non-recording sender.
// Normal Queue email continues through previewCupInvitations/sendCupInvitations.
// ---------------------------------------------------------------------------
let actions = fs.readFileSync(bulkActionsPath, "utf8");
let actionsChanged = false;
const testImport = 'import { queueCupTestEmail } from "@/lib/cups/test-email";';

if (!actions.includes(testImport)) {
  const cupImport =
    'import { cupErrorMessage, previewCupInvitations, sendCupInvitations } from "@/lib/cups/invitations";';
  actions = replaceRequired(
    actions,
    cupImport + "\n",
    cupImport + "\n" + testImport + "\n",
    "Cup invitation import for test sender",
  );
  actionsChanged = true;
}

if (!actions.includes('const cupSendMode = text(formData.get("cupSendMode"));')) {
  actions = replaceRequired(
    actions,
    '  const templateKey = text(formData.get("templateKey")) || null;\n',
    '  const templateKey = text(formData.get("templateKey")) || null;\n  const cupSendMode = text(formData.get("cupSendMode"));\n',
    "Cup send mode form field",
  );
  actionsChanged = true;
}

if (!actions.includes("explicit non-recording Cup test send")) {
  const anchor = [
    "    const cupId = openCups[0].id;",
    '    const kind = (savedEmailTemplate.key || templateKey || "").toLowerCase().includes("reminder") ? "REMINDER" : "INITIAL";',
    "    try {",
  ].join("\n");

  const replacement = [
    "    const cupId = openCups[0].id;",
    '    const kind = (savedEmailTemplate.key || templateKey || "").toLowerCase().includes("reminder") ? "REMINDER" : "INITIAL";',
    "",
    "    // explicit non-recording Cup test send",
    '    if (cupSendMode === "test") {',
    "      let testError: string | null = null;",
    "      try {",
    "        await queueCupTestEmail({",
    "          cupId,",
    "          actorId: createdByUserId,",
    "          teamId,",
    "          templateId,",
    "        });",
    "      } catch (error) {",
    "        testError = cupErrorMessage(error);",
    "      }",
    "",
    "      if (testError) {",
    '        redirect(appendRedirectParams(from, { error: `${testError} Nothing was sent.` }));',
    "      }",
    "",
    "      redirect(appendRedirectParams(from, {",
    '        saved: "queued",',
    '        channel: "email",',
    "        count: 1,",
    "        cupTest: 1,",
    "      }));",
    "    }",
    "",
    "    try {",
  ].join("\n");

  actions = replaceRequired(
    actions,
    anchor,
    replacement,
    "Cup test-send routing point",
  );
  actionsChanged = true;
}

if (actionsChanged) {
  fs.writeFileSync(bulkActionsPath, actions, "utf8");
  console.log("Team Messages now has an explicit non-recording Cup test-send route.");
} else {
  console.log("Team Messages Cup test-send route already applied.");
}

// ---------------------------------------------------------------------------
// Show a separate button only when the selected email template is a Cup
// template. The ordinary Queue email button remains the real invitation path.
// ---------------------------------------------------------------------------
let composer = fs.readFileSync(composerPath, "utf8");
let composerChanged = false;

if (!composer.includes("isCupTemplate?: boolean;")) {
  composer = replaceRequired(
    composer,
    "  ctaUrl: string | null;\n};",
    "  ctaUrl: string | null;\n  isCupTemplate?: boolean;\n};",
    "email template option type",
  );
  composerChanged = true;
}

if (!composer.includes("Send test Cup email")) {
  const anchor = [
    "              <CommunicationQueueButton",
    '                channel="EMAIL"',
    "                disabled={!emailSubject.trim() || !emailBody.trim() || selectedEmailCount === 0}",
    "              />",
  ].join("\n");

  const replacement = [
    "              {selectedEmailTemplate?.isCupTemplate ? (",
    '                <div className="mb-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">',
    '                  <p className="text-sm font-semibold text-amber-100">Test this Cup email safely</p>',
    '                  <p className="mt-1 text-xs leading-5 text-amber-100/75">',
    "                    This sends one test copy to the selected team contact. The YES / NO buttons are",
    "                    non-recording and no Cup invitation, response or entrant is created.",
    "                  </p>",
    "                  <button",
    '                    type="submit"',
    '                    name="cupSendMode"',
    '                    value="test"',
    "                    disabled={!emailSubject.trim() || !emailBody.trim() || selectedEmailCount === 0}",
    '                    className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"',
    "                  >",
    "                    Send test Cup email",
    "                  </button>",
    "                </div>",
    "              ) : null}",
    "",
    "              <CommunicationQueueButton",
    '                channel="EMAIL"',
    "                disabled={!emailSubject.trim() || !emailBody.trim() || selectedEmailCount === 0}",
    "              />",
  ].join("\n");

  composer = replaceRequired(
    composer,
    anchor,
    replacement,
    "email queue button for Cup test control",
  );
  composerChanged = true;
}

if (composerChanged) {
  fs.writeFileSync(composerPath, composer, "utf8");
  console.log("Team composer now exposes an explicit Cup test-email button.");
} else {
  console.log("Team composer Cup test-email button already applied.");
}

const finalPage = fs.readFileSync(messagesPagePath, "utf8");
const finalActions = fs.readFileSync(bulkActionsPath, "utf8");
const finalComposer = fs.readFileSync(composerPath, "utf8");

for (const marker of ["isCupTemplate: requiresCup"]) {
  if (!finalPage.includes(marker)) throw new Error(`Cup test page marker missing: ${marker}`);
}
for (const marker of ["queueCupTestEmail", "explicit non-recording Cup test send", "cupSendMode"]) {
  if (!finalActions.includes(marker)) throw new Error(`Cup test action marker missing: ${marker}`);
}
for (const marker of ["isCupTemplate?: boolean", "Send test Cup email", 'name="cupSendMode"']) {
  if (!finalComposer.includes(marker)) throw new Error(`Cup test composer marker missing: ${marker}`);
}

console.log("Cup test emails are explicit, non-recording, and separate from real invitations.");
