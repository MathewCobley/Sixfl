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
    throw new Error(`Team-message template scope target not found: ${target}`);
  }
}

function replaceRequired(source, anchor, replacement, description) {
  if (!source.includes(anchor)) {
    throw new Error(`Could not find ${description}.`);
  }
  return source.replace(anchor, replacement);
}

const rendererImport = 'import { extractNotificationTokens } from "@/lib/notifications/renderer";';
const cupPolicyImport = 'import { cupDate, money } from "@/lib/cups/invitation-policy";';
const cupFieldsDeclaration = `const CUP_TEAM_MESSAGE_TEMPLATE_FIELDS = new Set([\n  "cupFormat",\n  "cupName",\n  "matchFee",\n  "responseDeadline",\n  "scheduleNote",\n  "venueNote",\n]);`;

// ---------------------------------------------------------------------------
// Admin Messages page: keep Cup templates visible and provide Cup context.
// ---------------------------------------------------------------------------
let page = fs.readFileSync(messagesPagePath, "utf8");
let pageChanged = false;

if (!page.includes(rendererImport)) {
  page = replaceRequired(
    page,
    'import { requireAdmin } from "@/lib/requireAdmin";\n',
    'import { requireAdmin } from "@/lib/requireAdmin";\nimport { extractNotificationTokens } from "@/lib/notifications/renderer";\n',
    "Admin Messages requireAdmin import",
  );
  pageChanged = true;
}

if (!page.includes(cupPolicyImport)) {
  page = replaceRequired(
    page,
    `${rendererImport}\n`,
    `${rendererImport}\n${cupPolicyImport}\n`,
    "Admin Messages renderer import",
  );
  pageChanged = true;
}

if (!page.includes("CUP_TEAM_MESSAGE_TEMPLATE_FIELDS")) {
  page = replaceRequired(
    page,
    "function normaliseFilter(value?: string) {",
    `${cupFieldsDeclaration}\n\nfunction normaliseFilter(value?: string) {`,
    "Admin Messages filter function",
  );
  pageChanged = true;
}

if (!page.includes("error?: string;")) {
  page = replaceRequired(
    page,
    "    composeTeam?: string;\n  }>;",
    "    composeTeam?: string;\n    error?: string;\n  }>;",
    "Admin Messages search-param type",
  );
  pageChanged = true;
}

if (!page.includes("const cupMessageOptions =")) {
  const anchor = `  const fixedPaymentUrl = "https://buy.stripe.com/14A14n95tclzg2udgL7IY02";\n\n  const resolvedEmailTemplates = emailTemplates.map((template) => {`;
  const replacement = `  const fixedPaymentUrl = "https://buy.stripe.com/14A14n95tclzg2udgL7IY02";\n\n  const cupMessageRows = composeTeam\n    ? await prisma.$queryRaw<Array<{\n        id: string;\n        name: string;\n        cupFormat: string;\n        matchFeePence: number;\n        venueNote: string;\n        scheduleNote: string;\n        responseDeadline: Date;\n        state: string;\n      }>>\\`\n        SELECT l.id, c.name, c."cupFormat", s."matchFeePence", s."venueNote",\n               s."scheduleNote", s."responseDeadline", s.state\n        FROM "League" l\n        JOIN "LeagueCompetition" c ON c.id = l."competitionId"\n        JOIN "CupInvitationSettings" s ON s."cupLeagueId" = l.id\n        WHERE c."competitionType" = 'CUP'\n          AND l."isActive" = true\n          AND c."isActive" = true\n        ORDER BY c.name ASC, l."createdAt" DESC\n      \\`\n    : [];\n\n  const cupMessageOptions = cupMessageRows.map((cup) => ({\n    id: cup.id,\n    name: cup.name,\n    state: cup.state,\n    canSend: cup.state === "OPEN" && new Date(cup.responseDeadline).getTime() > Date.now(),\n    cupName: cup.name,\n    cupFormat: cup.cupFormat === "GROUPS_THEN_KNOCKOUT" ? "groups then knockout" : "straight knockout",\n    matchFee: money(cup.matchFeePence),\n    responseDeadline: cupDate(cup.responseDeadline),\n    venueNote: cup.venueNote,\n    scheduleNote: cup.scheduleNote,\n  }));\n\n  const resolvedEmailTemplates = emailTemplates.map((template) => {`;
  page = replaceRequired(page, anchor, replacement, "Admin Messages Cup-context insertion point");
  pageChanged = true;
}

if (!page.includes("const requiresCup =")) {
  page = replaceRequired(
    page,
    "  const resolvedEmailTemplates = emailTemplates.map((template) => {\n    const ctaUrl =",
    `  const resolvedEmailTemplates = emailTemplates.map((template) => {\n    const templateFields = [\n      ...extractNotificationTokens(template.subject),\n      ...extractNotificationTokens(template.body),\n    ];\n    const requiresCup = templateFields.some((field) => CUP_TEAM_MESSAGE_TEMPLATE_FIELDS.has(field));\n    const ctaUrl =`,
    "resolved Admin Messages email-template mapping",
  );
  pageChanged = true;
}

if (!page.includes("requiresCup,")) {
  page = replaceRequired(
    page,
    "      ctaLabel: template.ctaLabel,\n      ctaUrl,\n    };",
    "      ctaLabel: template.ctaLabel,\n      ctaUrl,\n      requiresCup,\n    };",
    "resolved Admin Messages template return",
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

if (!page.includes("cupOptions={cupMessageOptions}")) {
  page = replaceRequired(
    page,
    "                emailTemplates={resolvedEmailTemplates}\n",
    "                emailTemplates={resolvedEmailTemplates}\n                cupOptions={cupMessageOptions}\n",
    "TeamCommunicationsComposer emailTemplates prop",
  );
  pageChanged = true;
}

if (pageChanged) {
  fs.writeFileSync(messagesPagePath, page, "utf8");
  console.log("Admin Team Messages keeps Cup templates visible and provides Cup context.");
} else {
  console.log("Admin Team Messages Cup context already applied.");
}

// ---------------------------------------------------------------------------
// Composer: when a Cup template is selected, choose the Cup in the normal
// Team Messages UI and preview the saved Cup details. The server remains the
// authority for response URLs and actual Cup invitation content.
// ---------------------------------------------------------------------------
let composer = fs.readFileSync(composerPath, "utf8");
let composerChanged = false;

if (!composer.includes("requiresCup: boolean;")) {
  composer = replaceRequired(
    composer,
    "  ctaUrl: string | null;\n};",
    "  ctaUrl: string | null;\n  requiresCup: boolean;\n};",
    "EmailTemplateOption type",
  );
  composerChanged = true;
}

if (!composer.includes("type CupMessageOption =")) {
  composer = replaceRequired(
    composer,
    "type SmsTemplateOption = {",
    `type CupMessageOption = {\n  id: string;\n  name: string;\n  state: string;\n  canSend: boolean;\n  cupName: string;\n  cupFormat: string;\n  matchFee: string;\n  responseDeadline: string;\n  venueNote: string;\n  scheduleNote: string;\n};\n\ntype SmsTemplateOption = {`,
    "SMS template type",
  );
  composerChanged = true;
}

if (!composer.includes("cupOptions?: CupMessageOption[];")) {
  composer = replaceRequired(
    composer,
    "  emailTemplates: EmailTemplateOption[];\n  smsTemplates: SmsTemplateOption[];",
    "  emailTemplates: EmailTemplateOption[];\n  cupOptions?: CupMessageOption[];\n  smsTemplates: SmsTemplateOption[];",
    "TeamCommunicationsComposer props",
  );
  composerChanged = true;
}

if (!composer.includes("function resolveCupText(")) {
  composer = replaceRequired(
    composer,
    "function getAvailabilityClasses(response?: AvailabilityResponse) {",
    `function resolveCupText(text: string, cup?: CupMessageOption | null) {\n  if (!cup) return text;\n\n  return text\n    .replaceAll("{{cupName}}", cup.cupName)\n    .replaceAll("{{cupFormat}}", cup.cupFormat)\n    .replaceAll("{{matchFee}}", cup.matchFee)\n    .replaceAll("{{responseDeadline}}", cup.responseDeadline)\n    .replaceAll("{{venueNote}}", cup.venueNote)\n    .replaceAll("{{scheduleNote}}", cup.scheduleNote)\n    .replaceAll("{{yesResponseUrl}}", "[YES response link added when sent]")\n    .replaceAll("{{noResponseUrl}}", "[NO response link added when sent]")\n    .replaceAll("{{yesUrl}}", "[YES response link added when sent]")\n    .replaceAll("{{noUrl}}", "[NO response link added when sent]");\n}\n\nfunction getAvailabilityClasses(response?: AvailabilityResponse) {`,
    "availability class helper",
  );
  composerChanged = true;
}

if (!composer.includes("cupOptions = [],")) {
  composer = replaceRequired(
    composer,
    "  emailTemplates,\n  smsTemplates,",
    "  emailTemplates,\n  cupOptions = [],\n  smsTemplates,",
    "TeamCommunicationsComposer destructuring",
  );
  composerChanged = true;
}

if (!composer.includes("const [selectedCupId, setSelectedCupId]")) {
  composer = replaceRequired(
    composer,
    '  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState("");\n',
    '  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState("");\n  const [selectedCupId, setSelectedCupId] = useState("");\n',
    "selected email template state",
  );
  composerChanged = true;
}

if (!composer.includes("const selectedCup = useMemo(")) {
  composer = replaceRequired(
    composer,
    `  const selectedEmailTemplate = useMemo(\n    () => emailTemplates.find((template) => template.id === selectedEmailTemplateId) ?? null,\n    [emailTemplates, selectedEmailTemplateId],\n  );\n`,
    `  const selectedEmailTemplate = useMemo(\n    () => emailTemplates.find((template) => template.id === selectedEmailTemplateId) ?? null,\n    [emailTemplates, selectedEmailTemplateId],\n  );\n  const selectedCup = useMemo(\n    () => cupOptions.find((cup) => cup.id === selectedCupId) ?? null,\n    [cupOptions, selectedCupId],\n  );\n`,
    "selected email template memo",
  );
  composerChanged = true;
}

if (!composer.includes("const onlyOpenCup")) {
  composer = replaceRequired(
    composer,
    `    const template = emailTemplates.find((item) => item.id === templateId) ?? null;\n\n    if (!template) {`,
    `    const template = emailTemplates.find((item) => item.id === templateId) ?? null;\n\n    if (template?.requiresCup) {\n      const openCups = cupOptions.filter((cup) => cup.canSend);\n      const onlyOpenCup = openCups.length === 1 ? openCups[0] : null;\n      if (!selectedCupId && onlyOpenCup) setSelectedCupId(onlyOpenCup.id);\n      if (showTeamContactRecipient) {\n        setSelectedRecipientValues([getRecipientValue({ type: "team" })]);\n      }\n    }\n\n    if (!template) {`,
    "email template change handler",
  );
  composerChanged = true;
}

if (!composer.includes("resolveCupText(resolveText(template.subject")) {
  composer = replaceRequired(
    composer,
    `    setEmailSubject(resolveText(template.subject, templateContext));\n    setEmailBody(resolveText(template.body, templateContext));`,
    `    const cupForPreview = template.requiresCup\n      ? selectedCup ?? (cupOptions.filter((cup) => cup.canSend).length === 1 ? cupOptions.find((cup) => cup.canSend) ?? null : null)\n      : null;\n    setEmailSubject(resolveCupText(resolveText(template.subject, templateContext), cupForPreview));\n    setEmailBody(resolveCupText(resolveText(template.body, templateContext), cupForPreview));`,
    "email template preview resolution",
  );
  composerChanged = true;
}

if (!composer.includes("selectedEmailTemplate.requiresCup ? selectedCup : null")) {
  composer = replaceRequired(
    composer,
    `    setEmailSubject(resolveText(selectedEmailTemplate.subject, templateContext));\n    setEmailBody(resolveText(selectedEmailTemplate.body, templateContext));\n  }, [selectedEmailTemplate, templateContext]);`,
    `    const cupForPreview = selectedEmailTemplate.requiresCup ? selectedCup : null;\n    setEmailSubject(resolveCupText(resolveText(selectedEmailTemplate.subject, templateContext), cupForPreview));\n    setEmailBody(resolveCupText(resolveText(selectedEmailTemplate.body, templateContext), cupForPreview));\n  }, [selectedEmailTemplate, templateContext, selectedCup]);`,
    "selected email template effect",
  );
  composerChanged = true;
}

if (!composer.includes('label="Cup"')) {
  const anchor = `            <TemplateSelect\n              label="Email template"\n              value={selectedEmailTemplateId}\n              onChange={handleEmailTemplateChange}\n              options={emailTemplates.map((template) => ({\n                id: template.id,\n                name: template.name,\n                description: template.description,\n              }))}\n              placeholder="Choose email template"\n            />\n`;
  const replacement = `${anchor}\n            {selectedEmailTemplate?.requiresCup ? (\n              <div className="space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-3">\n                <TemplateSelect\n                  label="Cup"\n                  value={selectedCupId}\n                  onChange={setSelectedCupId}\n                  options={cupOptions.map((cup) => ({\n                    id: cup.id,\n                    name: \`\${cup.name} — \${cup.canSend ? "Open" : cup.state === "DRAFT" ? "Draft — do not send" : "Closed"}\`,\n                    description: cup.canSend\n                      ? \`\${cup.matchFee} · response deadline \${cup.responseDeadline}\`\n                      : "This Cup cannot send invitations yet.",\n                  }))}\n                  placeholder="Choose Cup"\n                />\n                <p className="text-xs leading-5 text-white/55">\n                  This is still a normal team email. SIXFL will fill the Cup details and private YES / NO links when it is sent.\n                </p>\n                {selectedCup && !selectedCup.canSend ? (\n                  <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">\n                    This Cup is {selectedCup.state === "DRAFT" ? "Draft — do not send" : "not open for invitations"}. Change it to Open in Cup setup before sending.\n                  </p>\n                ) : null}\n              </div>\n            ) : null}\n`;
  composer = replaceRequired(composer, anchor, replacement, "Email template selector");
  composerChanged = true;
}

if (!composer.includes("readOnly={Boolean(selectedEmailTemplate?.requiresCup)}")) {
  composer = replaceRequired(
    composer,
    '                onChange={(event) => setEmailSubject(event.target.value)}\n',
    '                onChange={(event) => setEmailSubject(event.target.value)}\n                readOnly={Boolean(selectedEmailTemplate?.requiresCup)}\n',
    "email subject onChange",
  );
  composer = replaceRequired(
    composer,
    '                onChange={(event) => setEmailBody(event.target.value)}\n                rows={10}\n',
    '                onChange={(event) => setEmailBody(event.target.value)}\n                readOnly={Boolean(selectedEmailTemplate?.requiresCup)}\n                rows={10}\n',
    "email body onChange",
  );
  composerChanged = true;
}

if (!composer.includes('name="cupId"')) {
  composer = replaceRequired(
    composer,
    '              <input type="hidden" name="templateId" value={selectedEmailTemplateId} />\n',
    '              <input type="hidden" name="templateId" value={selectedEmailTemplateId} />\n              <input type="hidden" name="cupId" value={selectedCupId} />\n',
    "email template hidden input",
  );
  composerChanged = true;
}

if (!composer.includes("selectedEmailTemplate?.requiresCup && (!selectedCup?.canSend")) {
  composer = replaceRequired(
    composer,
    "                disabled={!emailSubject.trim() || !emailBody.trim() || selectedEmailCount === 0}\n",
    "                disabled={!emailSubject.trim() || !emailBody.trim() || selectedEmailCount === 0 || Boolean(selectedEmailTemplate?.requiresCup && (!selectedCup?.canSend || selectedRecipientValues.some((value) => value !== getRecipientValue({ type: \"team\" }))))}\n",
    "email queue button disabled expression",
  );
  composerChanged = true;
}

if (composerChanged) {
  fs.writeFileSync(composerPath, composer, "utf8");
  console.log("Team Messages Cup templates now use an in-composer Cup selector and safe preview.");
} else {
  console.log("Team Messages Cup composer context already applied.");
}

// ---------------------------------------------------------------------------
// Server action: if the selected saved template is a Cup template, route the
// ordinary Team Messages send through the audited Cup invitation engine. This
// preserves private YES/NO links, invitation status and duplicate safeguards.
// ---------------------------------------------------------------------------
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

const cupInvitationsImport = 'import { cupErrorMessage, previewCupInvitations, sendCupInvitations } from "@/lib/cups/invitations";';
if (!actions.includes(cupInvitationsImport)) {
  actions = replaceRequired(
    actions,
    `${rendererImport}\n`,
    `${rendererImport}\n${cupInvitationsImport}\n`,
    "team bulk-action renderer import",
  );
  actionsChanged = true;
}

if (!actions.includes("TEAM_MESSAGE_SUPPORTED_TEMPLATE_FIELDS")) {
  actions = replaceRequired(
    actions,
    "function text(value: FormDataEntryValue | null) {",
    `const TEAM_MESSAGE_SUPPORTED_TEMPLATE_FIELDS = new Set([\n  "firstName",\n  "fullName",\n  "teamName",\n  "leagueName",\n  "claimCode",\n  "claimLink",\n  "captainDashboardUrl",\n  "yesResponseUrl",\n  "noResponseUrl",\n  "yesUrl",\n  "noUrl",\n  "pollOptions",\n  "pollLink",\n  "cta",\n]);\n\n${cupFieldsDeclaration}\n\nfunction text(value: FormDataEntryValue | null) {`,
    "team bulk-action text helper",
  );
  actionsChanged = true;
}

if (!actions.includes('const cupId = text(formData.get("cupId"));')) {
  actions = replaceRequired(
    actions,
    '  const templateId = text(formData.get("templateId")) || null;\n',
    '  const templateId = text(formData.get("templateId")) || null;\n  const cupId = text(formData.get("cupId"));\n',
    "team bulk-action template id",
  );
  actionsChanged = true;
}

if (!actions.includes("ordinary Team Messages Cup send")) {
  const anchor = `  if (channel === NotificationChannel.EMAIL && !subject) {\n    redirect(appendRedirectParams(from, { error: "Email subject is required." }));\n  }\n\n  const hasPollPlaceholder = messageNeedsPoll(body);\n  const usesPoll = Boolean(selectedPollId || hasPollPlaceholder);\n  const parsedRecipients = Array.from(new Set(recipientValues)).map((value) => ({ value, parsed: parseRecipientValue(value) }));\n\n  if (usesPoll && parsedRecipients.some((item) => item.parsed.type !== "team")) {`;
  const replacement = `  if (channel === NotificationChannel.EMAIL && !subject) {\n    redirect(appendRedirectParams(from, { error: "Email subject is required." }));\n  }\n\n  const hasPollPlaceholder = messageNeedsPoll(body);\n  const usesPoll = Boolean(selectedPollId || hasPollPlaceholder);\n  const parsedRecipients = Array.from(new Set(recipientValues)).map((value) => ({ value, parsed: parseRecipientValue(value) }));\n\n  const savedEmailTemplate = channel === NotificationChannel.EMAIL && templateId\n    ? await prisma.emailTemplate.findUnique({\n        where: { id: templateId },\n        select: { id: true, key: true, subject: true, body: true, isActive: true, audience: true },\n      })\n    : null;\n  const templateFields = Array.from(\n    new Set([\n      ...extractNotificationTokens(savedEmailTemplate?.subject ?? subject),\n      ...extractNotificationTokens(savedEmailTemplate?.body ?? body),\n    ]),\n  );\n  const isCupTemplate = templateFields.some((field) => CUP_TEAM_MESSAGE_TEMPLATE_FIELDS.has(field));\n\n  // ordinary Team Messages Cup send: the UI remains the normal team composer,\n  // while the audited Cup engine supplies private response URLs and tracks the reply.\n  if (channel === NotificationChannel.EMAIL && isCupTemplate) {\n    if (!cupId) {\n      redirect(appendRedirectParams(from, { error: "Choose the Cup for this email. Nothing was sent." }));\n    }\n    if (!templateId || !savedEmailTemplate?.isActive || savedEmailTemplate.audience !== "TEAM") {\n      redirect(appendRedirectParams(from, { error: "Choose an active Team Cup email template. Nothing was sent." }));\n    }\n    if (!createdByUserId) {\n      redirect(appendRedirectParams(from, { error: "Administrator identity is required for a Cup invitation. Nothing was sent." }));\n    }\n    if (parsedRecipients.length !== 1 || parsedRecipients[0]?.parsed.type !== "team") {\n      redirect(appendRedirectParams(from, { error: "Cup invitations are sent to the team contact. Untick individual squad recipients and try again. Nothing was sent." }));\n    }\n\n    const kind = (savedEmailTemplate.key || templateKey || "").toLowerCase().includes("reminder") ? "REMINDER" : "INITIAL";\n    let cupResults: Awaited<ReturnType<typeof sendCupInvitations>>;\n    try {\n      const preview = await previewCupInvitations({\n        cupId,\n        actorId: createdByUserId,\n        teamIds: [teamId],\n        kind,\n        templateId,\n      });\n      cupResults = await sendCupInvitations({\n        cupId,\n        actorId: createdByUserId,\n        teamIds: [teamId],\n        kind,\n        templateId,\n        previewKey: preview.previewKey,\n        confirmed: true,\n      });\n    } catch (error) {\n      redirect(appendRedirectParams(from, { error: \`\${cupErrorMessage(error)} Nothing was sent.\` }));\n    }\n\n    const queued = cupResults.reduce((sum, result) => sum + result.queued, 0);\n    const existing = cupResults.reduce((sum, result) => sum + result.existing, 0);\n    const skipped = cupResults.reduce((sum, result) => sum + result.skipped, 0);\n    const resultError = cupResults.find((result) => result.error)?.error ?? null;\n\n    if (queued === 0 && existing === 0) {\n      redirect(appendRedirectParams(from, { error: resultError || "Cup email was not queued. Nothing was sent." }));\n    }\n\n    redirect(appendRedirectParams(from, {\n      saved: queued > 0 ? "queued" : "already_queued",\n      channel: "email",\n      count: queued || existing,\n      skipped: skipped || null,\n      duplicates: existing || null,\n    }));\n  }\n\n  if (channel === NotificationChannel.EMAIL) {\n    const unsupportedFields = templateFields.filter(\n      (field) => !TEAM_MESSAGE_SUPPORTED_TEMPLATE_FIELDS.has(field),\n    );\n    if (unsupportedFields.length > 0) {\n      redirect(appendRedirectParams(from, {\n        error: \`This template needs fields that are not available in Team Messages: \${unsupportedFields.join(", ")}. Nothing was sent.\`,\n      }));\n    }\n  }\n\n  if (usesPoll && parsedRecipients.some((item) => item.parsed.type !== "team")) {`;
  actions = replaceRequired(actions, anchor, replacement, "team bulk-action email/cup guard");
  actionsChanged = true;
}

if (actionsChanged) {
  fs.writeFileSync(bulkActionsPath, actions, "utf8");
  console.log("Ordinary Team Messages can now send Cup templates through the audited Cup invitation engine.");
} else {
  console.log("Team-message Cup send routing already applied.");
}

const finalPage = fs.readFileSync(messagesPagePath, "utf8");
const finalComposer = fs.readFileSync(composerPath, "utf8");
const finalActions = fs.readFileSync(bulkActionsPath, "utf8");
for (const marker of [
  "cupMessageOptions",
  "requiresCup",
  "Team message was not sent",
  "cupOptions={cupMessageOptions}",
]) {
  if (!finalPage.includes(marker)) {
    throw new Error(`Admin Messages Cup-context marker missing: ${marker}`);
  }
}
for (const marker of [
  'label="Cup"',
  'name="cupId"',
  "selectedCup?.canSend",
  "This is still a normal team email",
]) {
  if (!finalComposer.includes(marker)) {
    throw new Error(`Team composer Cup-context marker missing: ${marker}`);
  }
}
for (const marker of [
  "ordinary Team Messages Cup send",
  "previewCupInvitations",
  "sendCupInvitations",
  "CUP_TEAM_MESSAGE_TEMPLATE_FIELDS",
]) {
  if (!finalActions.includes(marker)) {
    throw new Error(`Team-message Cup send marker missing: ${marker}`);
  }
}

console.log("Cup templates remain ordinary Team Messages while Cup-specific data and response tracking stay safe.");
