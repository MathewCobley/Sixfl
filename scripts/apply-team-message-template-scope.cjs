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
    throw new Error(`Team-message Cup integration target not found: ${target}`);
  }
}

function replaceRequired(source, anchor, replacement, description) {
  if (!source.includes(anchor)) {
    throw new Error(`Could not find ${description}.`);
  }
  return source.replace(anchor, replacement);
}

const rendererImport =
  'import { extractNotificationTokens } from "@/lib/notifications/renderer";';
const cupImport =
  'import { cupErrorMessage, previewCupInvitations, sendCupInvitations } from "@/lib/cups/invitations";';
const cupFieldsDeclaration = `const CUP_TEAM_MESSAGE_TEMPLATE_FIELDS = new Set([
  "cupFormat",
  "cupName",
  "matchFee",
  "responseDeadline",
  "scheduleNote",
  "venueNote",
]);`;

// ---------------------------------------------------------------------------
// Team Messages page: keep Cup templates in the normal template list.
// If there is one obvious current Cup, use its saved details for the on-screen
// preview. Actual sending still uses the authoritative Cup invitation engine.
// ---------------------------------------------------------------------------
let page = fs.readFileSync(messagesPagePath, "utf8");
let pageChanged = false;

if (!page.includes(rendererImport)) {
  page = replaceRequired(
    page,
    'import { requireAdmin } from "@/lib/requireAdmin";\n',
    'import { requireAdmin } from "@/lib/requireAdmin";\n' +
      rendererImport +
      "\n",
    "Admin Messages requireAdmin import",
  );
  pageChanged = true;
}

if (!page.includes("CUP_TEAM_MESSAGE_TEMPLATE_FIELDS")) {
  page = replaceRequired(
    page,
    "function normaliseFilter(value?: string) {",
    cupFieldsDeclaration + "\n\nfunction normaliseFilter(value?: string) {",
    "Admin Messages normaliseFilter",
  );
  pageChanged = true;
}

if (!page.includes("error?: string;")) {
  page = replaceRequired(
    page,
    "    composeTeam?: string;\n  }>;",
    "    composeTeam?: string;\n    error?: string;\n  }>;",
    "Admin Messages search params",
  );
  pageChanged = true;
}

if (!page.includes("const cupMessageRows =")) {
  const anchor =
    '  const fixedPaymentUrl = "https://buy.stripe.com/14A14n95tclzg2udgL7IY02";\n\n' +
    "  const resolvedEmailTemplates = emailTemplates.map((template) => {";

  const replacement = [
    '  const fixedPaymentUrl = "https://buy.stripe.com/14A14n95tclzg2udgL7IY02";',
    "",
    "  const cupMessageRows = composeTeam",
    "    ? await prisma.$queryRawUnsafe<Array<{",
    "        id: string;",
    "        name: string;",
    "        cupFormat: string;",
    "        matchFeePence: number;",
    "        venueNote: string;",
    "        scheduleNote: string;",
    "        responseDeadline: Date;",
    "        state: string;",
    "      }>>(",
    '        `SELECT l.id, c.name, c."cupFormat", s."matchFeePence", s."venueNote",',
    '                s."scheduleNote", s."responseDeadline", s.state',
    '         FROM "League" l',
    '         JOIN "LeagueCompetition" c ON c.id = l."competitionId"',
    '         JOIN "CupInvitationSettings" s ON s."cupLeagueId" = l.id',
    "         WHERE c.\"competitionType\" = 'CUP'",
    '           AND l."isActive" = true',
    '           AND c."isActive" = true',
    '         ORDER BY l."createdAt" DESC',
    "         LIMIT 10`,",
    "      )",
    "    : [];",
    "",
    "  const sendableCupRows = cupMessageRows.filter(",
    '    (cup) => cup.state === "OPEN" && new Date(cup.responseDeadline).getTime() > Date.now(),',
    "  );",
    "  const cupMessageContext =",
    "    sendableCupRows.length === 1",
    "      ? sendableCupRows[0]",
    "      : cupMessageRows.length === 1",
    "        ? cupMessageRows[0]",
    "        : null;",
    "",
    "  function resolveCupPreview(value: string) {",
    "    if (!cupMessageContext) return value;",
    "    const cupFormat =",
    '      cupMessageContext.cupFormat === "GROUPS_THEN_KNOCKOUT"',
    '        ? "groups then knockout"',
    '        : "straight knockout";',
    '    const matchFee = new Intl.NumberFormat("en-GB", {',
    '      style: "currency",',
    '      currency: "GBP",',
    "      maximumFractionDigits: 2,",
    "    }).format(cupMessageContext.matchFeePence / 100);",
    '    const responseDeadline = new Intl.DateTimeFormat("en-GB", {',
    '      timeZone: "Europe/London",',
    '      day: "numeric",',
    '      month: "short",',
    '      year: "numeric",',
    '      hour: "2-digit",',
    '      minute: "2-digit",',
    "    }).format(new Date(cupMessageContext.responseDeadline));",
    "",
    "    return value",
    '      .replaceAll("{{cupName}}", cupMessageContext.name)',
    '      .replaceAll("{{cupFormat}}", cupFormat)',
    '      .replaceAll("{{matchFee}}", matchFee)',
    '      .replaceAll("{{responseDeadline}}", responseDeadline)',
    '      .replaceAll("{{venueNote}}", cupMessageContext.venueNote)',
    '      .replaceAll("{{scheduleNote}}", cupMessageContext.scheduleNote)',
    '      .replaceAll("{{yesResponseUrl}}", "[private YES response link added when sent]")',
    '      .replaceAll("{{noResponseUrl}}", "[private NO response link added when sent]")',
    '      .replaceAll("{{yesUrl}}", "[private YES response link added when sent]")',
    '      .replaceAll("{{noUrl}}", "[private NO response link added when sent]");',
    "  }",
    "",
    "  const resolvedEmailTemplates = emailTemplates.map((template) => {",
  ].join("\n");

  page = replaceRequired(
    page,
    anchor,
    replacement,
    "Admin Messages Cup preview insertion point",
  );
  pageChanged = true;
}

if (!page.includes("const requiresCup =")) {
  page = replaceRequired(
    page,
    "  const resolvedEmailTemplates = emailTemplates.map((template) => {\n    const ctaUrl =",
    [
      "  const resolvedEmailTemplates = emailTemplates.map((template) => {",
      "    const templateFields = [",
      "      ...extractNotificationTokens(template.subject),",
      "      ...extractNotificationTokens(template.body),",
      "    ];",
      "    const requiresCup = templateFields.some((field) =>",
      "      CUP_TEAM_MESSAGE_TEMPLATE_FIELDS.has(field),",
      "    );",
      "    const ctaUrl =",
    ].join("\n"),
    "Admin Messages template mapping",
  );
  pageChanged = true;
}

if (!page.includes("subject: requiresCup ? resolveCupPreview(template.subject)")) {
  page = replaceRequired(
    page,
    "      subject: template.subject,\n      body: template.body,",
    [
      "      subject: requiresCup ? resolveCupPreview(template.subject) : template.subject,",
      "      body: requiresCup ? resolveCupPreview(template.body) : template.body,",
    ].join("\n"),
    "Admin Messages template subject/body",
  );
  pageChanged = true;
}

if (!page.includes("Team message was not sent")) {
  page = replaceRequired(
    page,
    "              <TeamCommunicationsComposer\n",
    [
      "              {sp.error ? (",
      '                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">',
      '                  <span className="font-semibold">Team message was not sent.</span>{" "}',
      "                  {sp.error}",
      "                </div>",
      "              ) : null}",
      "",
      "              <TeamCommunicationsComposer",
      "",
    ].join("\n"),
    "Admin Messages composer",
  );
  pageChanged = true;
}

if (pageChanged) {
  fs.writeFileSync(messagesPagePath, page, "utf8");
  console.log("Team Messages keeps Cup templates visible with Cup-aware preview.");
} else {
  console.log("Team Messages Cup preview already applied.");
}

// ---------------------------------------------------------------------------
// Send action: detect a Cup template from the saved template record. When one
// is selected, send it as an ordinary Team Message through the existing Cup
// engine so YES/NO links, status, auditing and duplicate protection stay valid.
// ---------------------------------------------------------------------------
let actions = fs.readFileSync(bulkActionsPath, "utf8");
let actionsChanged = false;

if (!actions.includes(rendererImport)) {
  actions = replaceRequired(
    actions,
    'import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";\n',
    'import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";\n' +
      rendererImport +
      "\n",
    "team bulk-action profile import",
  );
  actionsChanged = true;
}

if (!actions.includes(cupImport)) {
  actions = replaceRequired(
    actions,
    rendererImport + "\n",
    rendererImport + "\n" + cupImport + "\n",
    "team bulk-action renderer import",
  );
  actionsChanged = true;
}

if (!actions.includes("CUP_TEAM_MESSAGE_TEMPLATE_FIELDS")) {
  actions = replaceRequired(
    actions,
    "function text(value: FormDataEntryValue | null) {",
    cupFieldsDeclaration + "\n\nfunction text(value: FormDataEntryValue | null) {",
    "team bulk-action text helper",
  );
  actionsChanged = true;
}

if (!actions.includes("ordinary Team Messages Cup send")) {
  const anchor = [
    "  const hasPollPlaceholder = messageNeedsPoll(body);",
    "  const usesPoll = Boolean(selectedPollId || hasPollPlaceholder);",
    "  const parsedRecipients = Array.from(new Set(recipientValues)).map((value) => ({ value, parsed: parseRecipientValue(value) }));",
    "",
    '  if (usesPoll && parsedRecipients.some((item) => item.parsed.type !== "team")) {',
  ].join("\n");

  const replacement = [
    "  const hasPollPlaceholder = messageNeedsPoll(body);",
    "  const usesPoll = Boolean(selectedPollId || hasPollPlaceholder);",
    "  const parsedRecipients = Array.from(new Set(recipientValues)).map((value) => ({ value, parsed: parseRecipientValue(value) }));",
    "",
    "  const savedEmailTemplate = channel === NotificationChannel.EMAIL && templateId",
    "    ? await prisma.emailTemplate.findUnique({",
    "        where: { id: templateId },",
    "        select: { id: true, key: true, subject: true, body: true, isActive: true, audience: true },",
    "      })",
    "    : null;",
    "  const savedTemplateFields = Array.from(",
    "    new Set([",
    "      ...extractNotificationTokens(savedEmailTemplate?.subject ?? subject),",
    "      ...extractNotificationTokens(savedEmailTemplate?.body ?? body),",
    "    ]),",
    "  );",
    "  const isCupTemplate = savedTemplateFields.some((field) =>",
    "    CUP_TEAM_MESSAGE_TEMPLATE_FIELDS.has(field),",
    "  );",
    "",
    "  // ordinary Team Messages Cup send",
    "  if (channel === NotificationChannel.EMAIL && isCupTemplate) {",
    "    if (!templateId || !savedEmailTemplate?.isActive || savedEmailTemplate.audience !== \"TEAM\") {",
    '      redirect(appendRedirectParams(from, { error: "Choose an active Team Cup email template. Nothing was sent." }));',
    "    }",
    "    if (!createdByUserId) {",
    '      redirect(appendRedirectParams(from, { error: "Administrator identity is required for a Cup invitation. Nothing was sent." }));',
    "    }",
    '    if (parsedRecipients.length !== 1 || parsedRecipients[0]?.parsed.type !== "team") {',
    '      redirect(appendRedirectParams(from, { error: "Cup invitations are sent to the team contact. Untick individual squad recipients and try again. Nothing was sent." }));',
    "    }",
    "",
    "    const openCups = await prisma.$queryRawUnsafe<Array<{ id: string }>>(",
    '      `SELECT l.id',
    '       FROM "League" l',
    '       JOIN "LeagueCompetition" c ON c.id = l."competitionId"',
    '       JOIN "CupInvitationSettings" s ON s."cupLeagueId" = l.id',
    "       WHERE c.\"competitionType\" = 'CUP'",
    '         AND l."isActive" = true',
    '         AND c."isActive" = true',
    "         AND s.state = 'OPEN'",
    '         AND s."responseDeadline" > NOW()',
    '       ORDER BY l."createdAt" DESC',
    "       LIMIT 2`,",
    "    );",
    "",
    "    if (openCups.length === 0) {",
    '      redirect(appendRedirectParams(from, { error: "Cup invitations are currently Draft / closed. Change the Cup to Open before sending. Nothing was sent." }));',
    "    }",
    "    if (openCups.length > 1) {",
    '      redirect(appendRedirectParams(from, { error: "More than one Cup is open. Use the Cup invitations screen for this send so SIXFL can identify the correct Cup. Nothing was sent." }));',
    "    }",
    "",
    "    const cupId = openCups[0].id;",
    '    const kind = (savedEmailTemplate.key || templateKey || "").toLowerCase().includes("reminder") ? "REMINDER" : "INITIAL";',
    "    try {",
    "      const preview = await previewCupInvitations({",
    "        cupId,",
    "        actorId: createdByUserId,",
    "        teamIds: [teamId],",
    "        kind,",
    "        templateId,",
    "      });",
    "      const results = await sendCupInvitations({",
    "        cupId,",
    "        actorId: createdByUserId,",
    "        teamIds: [teamId],",
    "        kind,",
    "        templateId,",
    "        previewKey: preview.previewKey,",
    "        confirmed: true,",
    "      });",
    "      const queued = results.reduce((sum, result) => sum + result.queued, 0);",
    "      const existing = results.reduce((sum, result) => sum + result.existing, 0);",
    "      const skipped = results.reduce((sum, result) => sum + result.skipped, 0);",
    "      const resultError = results.find((result) => result.error)?.error ?? null;",
    "      if (queued === 0 && existing === 0) {",
    '        redirect(appendRedirectParams(from, { error: resultError || "Cup email was not queued. Nothing was sent." }));',
    "      }",
    "      redirect(appendRedirectParams(from, {",
    '        saved: queued > 0 ? "queued" : "already_queued",',
    '        channel: "email",',
    "        count: queued || existing,",
    "        skipped: skipped || null,",
    "        duplicates: existing || null,",
    "      }));",
    "    } catch (error) {",
    '      redirect(appendRedirectParams(from, { error: `${cupErrorMessage(error)} Nothing was sent.` }));',
    "    }",
    "  }",
    "",
    '  if (usesPoll && parsedRecipients.some((item) => item.parsed.type !== "team")) {',
  ].join("\n");

  actions = replaceRequired(
    actions,
    anchor,
    replacement,
    "team bulk-action Cup routing point",
  );
  actionsChanged = true;
}

if (actionsChanged) {
  fs.writeFileSync(bulkActionsPath, actions, "utf8");
  console.log("Ordinary Team Messages can send Cup templates through the audited Cup engine.");
} else {
  console.log("Ordinary Team Messages Cup routing already applied.");
}

const finalPage = fs.readFileSync(messagesPagePath, "utf8");
const finalActions = fs.readFileSync(bulkActionsPath, "utf8");

for (const marker of [
  "cupMessageRows",
  "resolveCupPreview",
  "Team message was not sent",
]) {
  if (!finalPage.includes(marker)) {
    throw new Error(`Admin Messages Cup marker missing: ${marker}`);
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

console.log("Cup templates remain ordinary Team Messages and use safe Cup response tracking.");
