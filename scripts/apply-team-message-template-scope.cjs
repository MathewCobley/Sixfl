const fs = require("node:fs");
const path = require("node:path");

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

for (const target of [messagesPagePath, bulkActionsPath]) {
  if (!fs.existsSync(target)) {
    throw new Error(`Team-message template scope target not found: ${target}`);
  }
}

function replaceRequired(source, anchor, replacement, description) {
  if (!source.includes(anchor)) {
    throw new Error(`Could not find ${description}.`);
  }
  return source.replace(anchor, replacement);
}

let page = fs.readFileSync(messagesPagePath, "utf8");
let pageChanged = false;

const rendererImport = 'import { extractNotificationTokens } from "@/lib/notifications/renderer";';
if (!page.includes(rendererImport)) {
  page = replaceRequired(
    page,
    'import { requireAdmin } from "@/lib/requireAdmin";\n',
    'import { requireAdmin } from "@/lib/requireAdmin";\nimport { extractNotificationTokens } from "@/lib/notifications/renderer";\n',
    "Admin Messages requireAdmin import",
  );
  pageChanged = true;
}

if (!page.includes("CUP_ONLY_TEAM_MESSAGE_TEMPLATE_FIELDS")) {
  page = replaceRequired(
    page,
    "function normaliseFilter(value?: string) {",
    `const CUP_ONLY_TEAM_MESSAGE_TEMPLATE_FIELDS = new Set([\n  "cupFormat",\n  "cupName",\n  "matchFee",\n  "responseDeadline",\n  "scheduleNote",\n  "venueNote",\n]);\n\nfunction normaliseFilter(value?: string) {`,
    "Admin Messages filter function",
  );
  pageChanged = true;
}

if (!page.includes("error?: string;")) {
  page = replaceRequired(
    page,
    "    composeTeam?: string;\n  }>;",
    "    composeTeam?: string;\n    error?: string;\n  }>;,",
    "Admin Messages search-param type",
  ).replace("  }>;,", "  }>;");
  pageChanged = true;
}

if (!page.includes("Cup-only templates are intentionally hidden")) {
  page = replaceRequired(
    page,
    "  const resolvedEmailTemplates = emailTemplates.map((template) => {",
    `  // Cup-only templates are intentionally hidden here. They need the dedicated\n  // Cup invitation context (format, fee, deadline, venue and schedule) and must\n  // be sent from Admin → Cups → Invitations.\n  const resolvedEmailTemplates = emailTemplates\n    .filter((template) => {\n      const fields = [\n        ...extractNotificationTokens(template.subject),\n        ...extractNotificationTokens(template.body),\n      ];\n      return !fields.some((field) => CUP_ONLY_TEAM_MESSAGE_TEMPLATE_FIELDS.has(field));\n    })\n    .map((template) => {`,
    "resolved Admin Messages email-template mapping",
  );
  pageChanged = true;
}

if (!page.includes("Team message was not sent")) {
  page = replaceRequired(
    page,
    "              <TeamCommunicationsComposer\n",
    `              {sp.error ? (\n                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">\n                  <span className="font-semibold">Team message was not sent.</span>{" "}\n                  {sp.error}\n                </div>\n              ) : null}\n\n              <TeamCommunicationsComposer\n`,
    "TeamCommunicationsComposer render anchor",
  );
  pageChanged = true;
}

if (pageChanged) {
  fs.writeFileSync(messagesPagePath, page, "utf8");
  console.log("Admin Team Messages now hides Cup-only templates and shows safe send errors inline.");
} else {
  console.log("Admin Team Messages Cup-template scope already applied.");
}

let actions = fs.readFileSync(bulkActionsPath, "utf8");
let actionsChanged = false;

if (!actions.includes(rendererImport)) {
  actions = replaceRequired(
    actions,
    'import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";\n',
    'import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";\nimport { extractNotificationTokens } from "@/lib/notifications/renderer";\n',
    "team bulk-action profile import",
  );
  actionsChanged = true;
}

if (!actions.includes("TEAM_MESSAGE_SUPPORTED_TEMPLATE_FIELDS")) {
  actions = replaceRequired(
    actions,
    "function text(value: FormDataEntryValue | null) {",
    `const TEAM_MESSAGE_SUPPORTED_TEMPLATE_FIELDS = new Set([\n  "firstName",\n  "fullName",\n  "teamName",\n  "leagueName",\n  "claimCode",\n  "claimLink",\n  "captainDashboardUrl",\n  "yesResponseUrl",\n  "noResponseUrl",\n  "pollOptions",\n  "pollLink",\n  "cta",\n]);\n\nconst CUP_ONLY_TEAM_MESSAGE_TEMPLATE_FIELDS = new Set([\n  "cupFormat",\n  "cupName",\n  "matchFee",\n  "responseDeadline",\n  "scheduleNote",\n  "venueNote",\n]);\n\nfunction text(value: FormDataEntryValue | null) {`,
    "team bulk-action text helper",
  );
  actionsChanged = true;
}

if (!actions.includes("Send it from Admin → Cups → Invitations")) {
  const subjectGuard = `  if (channel === NotificationChannel.EMAIL && !subject) {\n    redirect(appendRedirectParams(from, { error: "Email subject is required." }));\n  }\n\n  const hasPollPlaceholder = messageNeedsPoll(body);`;
  const guardedSubject = `  if (channel === NotificationChannel.EMAIL && !subject) {\n    redirect(appendRedirectParams(from, { error: "Email subject is required." }));\n  }\n\n  if (channel === NotificationChannel.EMAIL) {\n    const templateFields = Array.from(\n      new Set([\n        ...extractNotificationTokens(subject),\n        ...extractNotificationTokens(body),\n      ]),\n    );\n    const unsupportedFields = templateFields.filter(\n      (field) => !TEAM_MESSAGE_SUPPORTED_TEMPLATE_FIELDS.has(field),\n    );\n\n    if (unsupportedFields.length > 0) {\n      const isCupTemplate = unsupportedFields.some((field) =>\n        CUP_ONLY_TEAM_MESSAGE_TEMPLATE_FIELDS.has(field),\n      );\n      const error = isCupTemplate\n        ? "This is a Cup invitation template. Send it from Admin → Cups → Invitations so the cup name, format, fee, deadline, venue and schedule details are filled automatically. Nothing was sent."\n        : \`This template needs fields that are not available in Team Messages: \${unsupportedFields.join(", ")}. Nothing was sent.\`;\n      redirect(appendRedirectParams(from, { error }));\n    }\n  }\n\n  const hasPollPlaceholder = messageNeedsPoll(body);`;
  actions = replaceRequired(
    actions,
    subjectGuard,
    guardedSubject,
    "team bulk-action email subject guard",
  );
  actionsChanged = true;
}

if (actionsChanged) {
  fs.writeFileSync(bulkActionsPath, actions, "utf8");
  console.log("Team-message sends now reject incompatible templates with a redirect instead of a server crash.");
} else {
  console.log("Team-message incompatible-template guard already applied.");
}

const finalPage = fs.readFileSync(messagesPagePath, "utf8");
const finalActions = fs.readFileSync(bulkActionsPath, "utf8");
for (const marker of [
  "Cup-only templates are intentionally hidden",
  "Team message was not sent",
  "CUP_ONLY_TEAM_MESSAGE_TEMPLATE_FIELDS",
]) {
  if (!finalPage.includes(marker)) {
    throw new Error(`Admin Messages Cup-template marker missing: ${marker}`);
  }
}
for (const marker of [
  "TEAM_MESSAGE_SUPPORTED_TEMPLATE_FIELDS",
  "Send it from Admin → Cups → Invitations",
  "extractNotificationTokens(subject)",
]) {
  if (!finalActions.includes(marker)) {
    throw new Error(`Team-message send guard marker missing: ${marker}`);
  }
}

console.log("Cup invitation templates are isolated from ordinary Team Messages without weakening outbound placeholder safety.");
