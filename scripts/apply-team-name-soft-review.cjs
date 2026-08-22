const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
}

function write(file, source) {
  fs.writeFileSync(path.join(root, ...file.split("/")), source, "utf8");
}

function insertOnce(source, marker, anchor, insertion, label) {
  if (source.includes(marker)) return source;
  if (!source.includes(anchor)) throw new Error(`Team-name review anchor missing: ${label}`);
  return source.replace(anchor, `${insertion}${anchor}`);
}

function replaceOnce(source, marker, before, after, label) {
  if (source.includes(marker)) return source;
  if (!source.includes(before)) throw new Error(`Team-name review source missing: ${label}`);
  return source.replace(before, after);
}

const suitabilityImport = `import {\n  assessTeamNameSuitability,\n  buildTeamNameReviewMessage,\n} from "@/lib/leads/team-name-suitability";\n`;

// ---------------------------------------------------------------------------
// Generic /register-team lead form.
// ---------------------------------------------------------------------------
{
  const file = "src/app/(public)/register-team/actions.ts";
  let source = read(file);

  source = insertOnce(
    source,
    'from "@/lib/leads/team-name-suitability"',
    'import { queueLeadWelcomeNotifications } from "@/lib/notifications/transactional";\n',
    suitabilityImport,
    "register-team suitability import",
  );

  source = insertOnce(
    source,
    "const teamNameReview = assessTeamNameSuitability(teamName);",
    '  const squadSize = clean(formData.get("squadSize"));\n',
    '  const teamNameReview = assessTeamNameSuitability(teamName);\n',
    "register-team assessment",
  );

  source = replaceOnce(
    source,
    "const reviewedMessage = buildTeamNameReviewMessage",
    `  const messageParts = [\n    \`Submitted from the SIXFL register-team page.\`,\n    squadSize ? \`Approx squad size: \${squadSize}\` : null,\n  ].filter(Boolean);`,
    `  const messageParts = [\n    \`Submitted from the SIXFL register-team page.\`,\n    squadSize ? \`Approx squad size: \${squadSize}\` : null,\n  ].filter(Boolean);\n  const reviewedMessage = buildTeamNameReviewMessage({\n    message: messageParts.join("\\n"),\n    review: teamNameReview,\n  });`,
    "register-team review message",
  );

  source = replaceOnce(
    source,
    "message: reviewedMessage || null",
    '      message: messageParts.join("\\n"),',
    '      message: reviewedMessage || null,',
    "register-team stored review message",
  );

  if (!source.includes("if (!teamNameReview.requiresReview) {\n    try {")) {
    const before = `  try {\n    await queueLeadWelcomeNotifications({\n      lead: createdLead,\n      signupUrl: "https://www.sixfl.co.uk/register-interest",\n    });\n  } catch (error) {\n    console.error("Register team welcome queue failed:", error);\n  }\n\n  redirect("/register-team/success");`;
    const after = `  if (!teamNameReview.requiresReview) {\n    try {\n      await queueLeadWelcomeNotifications({\n        lead: createdLead,\n        signupUrl: "https://www.sixfl.co.uk/register-interest",\n      });\n    } catch (error) {\n      console.error("Register team welcome queue failed:", error);\n    }\n  }\n\n  redirect(\n    teamNameReview.requiresReview\n      ? "/register-team/success?review=1"\n      : "/register-team/success",\n  );`;
    if (!source.includes(before)) throw new Error("Team-name review source missing: register-team welcome hold");
    source = source.replace(before, after);
  }

  write(file, source);
}

// ---------------------------------------------------------------------------
// Main /register-interest form.
// ---------------------------------------------------------------------------
{
  const file = "src/app/(public)/register-interest/actions.ts";
  let source = read(file);

  source = insertOnce(
    source,
    'from "@/lib/leads/team-name-suitability"',
    'import { resolveProspectiveLeagueId } from "@/lib/leads/prospectiveLeague";\n',
    suitabilityImport,
    "register-interest suitability import",
  );

  source = insertOnce(
    source,
    "const teamNameReview = assessTeamNameSuitability(teamName);",
    '  const area = String(formData.get("area") ?? "").trim();\n',
    '  const teamNameReview = assessTeamNameSuitability(teamName);\n',
    "register-interest assessment",
  );

  source = insertOnce(
    source,
    "const reviewedCombinedMessage =",
    `  const createdLead = await prisma.interestLead.create({`,
    `  const reviewedCombinedMessage =\n    interestType === "TEAM"\n      ? buildTeamNameReviewMessage({\n          message: combinedMessage,\n          review: teamNameReview,\n        })\n      : combinedMessage;\n\n`,
    "register-interest review message",
  );

  source = replaceOnce(
    source,
    "message: reviewedCombinedMessage || null",
    '      message: combinedMessage || null,',
    '      message: reviewedCombinedMessage || null,',
    "register-interest stored review message",
  );

  if (!source.includes('const holdTeamWelcome = interestType === "TEAM" && teamNameReview.requiresReview;')) {
    const anchor = `  try {\n    await queueLeadWelcomeNotifications({`;
    const insertion = `  const holdTeamWelcome =\n    interestType === "TEAM" && teamNameReview.requiresReview;\n\n  if (!holdTeamWelcome) {\n`;
    if (!source.includes(anchor)) throw new Error("Team-name review anchor missing: register-interest welcome start");
    source = source.replace(anchor, `${insertion}${anchor}`);

    const catchBlock = `  } catch (error) {\n    console.error("Lead welcome queue failed:", error);\n  }\n\n  try {`;
    const wrappedCatch = `  } catch (error) {\n    console.error("Lead welcome queue failed:", error);\n  }\n  }\n\n  try {`;
    if (!source.includes(catchBlock)) throw new Error("Team-name review anchor missing: register-interest welcome end");
    source = source.replace(catchBlock, wrappedCatch);
  }

  source = replaceOnce(
    source,
    "holdTeamWelcome ? `[TEAM NAME REVIEW] New SIXFL lead",
    '      subject: `New SIXFL lead: ${formatInterestType(createdLead.interestType)}`,',
    '      subject: holdTeamWelcome ? `[TEAM NAME REVIEW] New SIXFL lead: ${formatInterestType(createdLead.interestType)}` : `New SIXFL lead: ${formatInterestType(createdLead.interestType)}`,',
    "register-interest admin email subject",
  );

  source = replaceOnce(
    source,
    "review=${holdTeamWelcome ? \"1\" : \"0\"}",
    '  redirect(`/register-interest/success?type=${interestType.toLowerCase()}`);',
    '  redirect(`/register-interest/success?type=${interestType.toLowerCase()}&review=${holdTeamWelcome ? "1" : "0"}`);',
    "register-interest review redirect",
  );

  write(file, source);
}

function patchLeagueLeadAction(file, welcomeLabel) {
  let source = read(file);

  source = insertOnce(
    source,
    'from "@/lib/leads/team-name-suitability"',
    'import { queueLeadWelcomeNotifications } from "@/lib/notifications/transactional";\n',
    suitabilityImport,
    `${welcomeLabel} suitability import`,
  );

  source = insertOnce(
    source,
    "const teamNameReview = assessTeamNameSuitability(teamName);",
    '  const message = String(formData.get("message") ?? "").trim();\n',
    '  const teamNameReview = assessTeamNameSuitability(teamName);\n',
    `${welcomeLabel} assessment`,
  );

  const messageBefore = '      message: message || null,';
  const messageAfter = `      message:\n        interestType === InterestType.TEAM\n          ? buildTeamNameReviewMessage({ message, review: teamNameReview }) || null\n          : message || null,`;
  source = replaceOnce(
    source,
    "buildTeamNameReviewMessage({ message, review: teamNameReview })",
    messageBefore,
    messageAfter,
    `${welcomeLabel} stored review message`,
  );

  if (!source.includes("if (!holdTeamWelcome) {\n    try {")) {
    const teamLeadSelectEnd = `  });\n\n  try {\n    await queueLeadWelcomeNotifications({`;
    const replacementStart = `  });\n\n  const holdTeamWelcome =\n    interestType === InterestType.TEAM && teamNameReview.requiresReview;\n\n  if (!holdTeamWelcome) {\n    try {\n      await queueLeadWelcomeNotifications({`;
    if (!source.includes(teamLeadSelectEnd)) throw new Error(`Team-name review anchor missing: ${welcomeLabel} welcome start`);
    source = source.replace(teamLeadSelectEnd, replacementStart);

    const catchAnchor = `  } catch (error) {\n    console.error("${welcomeLabel} welcome queue failed:", error);\n  }\n\n  redirect(\`/leagues/thanks?lead=\${lead.id}\`);`;
    const catchReplacement = `    } catch (error) {\n      console.error("${welcomeLabel} welcome queue failed:", error);\n    }\n  }\n\n  redirect(\`/leagues/thanks?lead=\${lead.id}&review=\${holdTeamWelcome ? "1" : "0"}\`);`;
    if (!source.includes(catchAnchor)) throw new Error(`Team-name review anchor missing: ${welcomeLabel} welcome end`);
    source = source.replace(catchAnchor, catchReplacement);
  }

  write(file, source);
}

patchLeagueLeadAction("src/app/(public)/leagues/[slug]/actions.ts", "League lead");
patchLeagueLeadAction("src/app/(public)/leagues/heartlands/actions.ts", "Heartlands");

// ---------------------------------------------------------------------------
// Public confirmation pages explain that a flagged name is pending review.
// ---------------------------------------------------------------------------
{
  const file = "src/app/(public)/register-team/success/page.tsx";
  let source = read(file);

  source = replaceOnce(
    source,
    "const nameReview = review === \"1\";",
    `export default function RegisterTeamSuccessPage() {`,
    `export default async function RegisterTeamSuccessPage({\n  searchParams,\n}: {\n  searchParams?: Promise<{ review?: string }>;\n}) {\n  const { review } = (await searchParams) ?? {};\n  const nameReview = review === "1";`,
    "register-team success review state",
  );

  source = replaceOnce(
    source,
    "nameReview ? \"Your registration is being reviewed.\"",
    `            Your team has been registered.`,
    `            {nameReview ? "Your registration is being reviewed." : "Your team has been registered."}`,
    "register-team success heading",
  );

  source = replaceOnce(
    source,
    "The team name will be checked by SIXFL before it is used publicly.",
    `            We’re now organising leagues in your area and will be in touch shortly with next steps.`,
    `            {nameReview\n              ? "The team name will be checked by SIXFL before it is used publicly. This is a manual review rather than an automatic rejection, and we’ll contact you if a change is needed."\n              : "We’re now organising leagues in your area and will be in touch shortly with next steps."}`,
    "register-team success body",
  );

  write(file, source);
}

{
  const file = "src/app/(public)/register-interest/success/page.tsx";
  let source = read(file);

  source = replaceOnce(
    source,
    "searchParams: Promise<{ type?: string; review?: string }>",
    "searchParams: Promise<{ type?: string }>",
    "searchParams: Promise<{ type?: string; review?: string }>",
    "register-interest success params",
  );
  source = replaceOnce(
    source,
    "const { type, review } = await searchParams;",
    "  const { type } = await searchParams;",
    '  const { type, review } = await searchParams;\n  const nameReview = type === "team" && review === "1";',
    "register-interest success review state",
  );
  source = replaceOnce(
    source,
    "nameReview\n      ? \"Your team name is being reviewed",
    `  const body =\n    type === "player"`,
    `  const body =\n    nameReview\n      ? "Your team name is being reviewed by SIXFL before it is used publicly. This is a manual review rather than an automatic rejection, and we’ll contact you if a change is needed."\n      : type === "player"`,
    "register-interest success review body",
  );

  write(file, source);
}

{
  const file = "src/app/(public)/leagues/thanks/page.tsx";
  let source = read(file);

  source = insertOnce(
    source,
    'const nameReview = getLeadId(params.review).trim() === "1";',
    '  const leadId = getLeadId(params.lead).trim();\n',
    '  const nameReview = getLeadId(params.review).trim() === "1";\n',
    "league thanks review state",
  );
  source = replaceOnce(
    source,
    "nameReview\n              ? \"We’ve received your details and are reviewing the team name",
    `            We&apos;ve received your details and will be in touch soon about {leagueLabel}.`,
    `            {nameReview\n              ? \"We’ve received your details and are reviewing the team name before it is used publicly. This is a manual review rather than an automatic rejection; we’ll contact you if a change is needed.\"\n              : <>We&apos;ve received your details and will be in touch soon about {leagueLabel}.</>}`,
    "league thanks review body",
  );

  write(file, source);
}

// ---------------------------------------------------------------------------
// Admin lead detail: make held names prominent, and conversion becomes the
// explicit admin approval step rather than an automatic rejection.
// ---------------------------------------------------------------------------
{
  const file = "src/app/(admin)/admin/leads/[id]/page.tsx";
  let source = read(file);

  source = insertOnce(
    source,
    'from "@/lib/leads/team-name-suitability"',
    'import { prisma } from "@/lib/prisma";\n',
    'import { isTeamNameReviewMessage } from "@/lib/leads/team-name-suitability";\n',
    "admin lead review import",
  );

  source = insertOnce(
    source,
    "const requiresTeamNameReview =",
    '  const hasPhone = Boolean(lead.phone?.trim());\n',
    '  const requiresTeamNameReview =\n    lead.interestType === "TEAM" && isTeamNameReviewMessage(lead.message);\n',
    "admin lead review state",
  );

  source = insertOnce(
    source,
    "Team name review required",
    `      {managedSquadNotice ? (`,
    `      {requiresTeamNameReview ? (\n        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm leading-6 text-amber-50">\n          <div className="font-bold text-amber-200">Team name review required</div>\n          <p className="mt-1">\n            The public registration filter held this team name for manual review. It has not been automatically rejected. Check the name against the current League Rules before allowing it to be used publicly. Converting the lead to a team is treated as admin approval of the name.\n          </p>\n        </div>\n      ) : null}\n\n`,
    "admin lead review warning",
  );

  source = replaceOnce(
    source,
    "requiresNameReview={requiresTeamNameReview}",
    `                convertedTeamId={lead.convertedTeamId}\n              />`,
    `                convertedTeamId={lead.convertedTeamId}\n                requiresNameReview={requiresTeamNameReview}\n              />`,
    "admin lead conversion review prop",
  );

  write(file, source);
}

{
  const file = "src/components/admin/leads/ConvertLeadToTeamButton.tsx";
  let source = read(file);

  source = replaceOnce(
    source,
    "requiresNameReview?: boolean;",
    `  convertedTeamId?: string | null;`,
    `  convertedTeamId?: string | null;\n  requiresNameReview?: boolean;`,
    "convert button review prop type",
  );
  source = replaceOnce(
    source,
    "requiresNameReview = false,",
    `  convertedTeamId,\n}: Props) {`,
    `  convertedTeamId,\n  requiresNameReview = false,\n}: Props) {`,
    "convert button review prop",
  );
  source = replaceOnce(
    source,
    "requiresNameReview\n        ? \"Approve this held team name",
    `    const confirmed = window.confirm(\n      "Convert this lead into a team? This will create the team, create or link the captain user, add them as captain, and close the lead."\n    );`,
    `    const confirmed = window.confirm(\n      requiresNameReview\n        ? "Approve this held team name and convert the lead into a team? This confirms you have reviewed the name against the SIXFL League Rules. The team and captain account will then be created."\n        : "Convert this lead into a team? This will create the team, create or link the captain user, add them as captain, and close the lead."\n    );`,
    "convert button review confirmation",
  );
  source = replaceOnce(
    source,
    'requiresNameReview ? "Approve name & convert"',
    `{isPending ? "Converting..." : "Convert to team"}`,
    `{isPending\n            ? "Converting..."\n            : requiresNameReview\n              ? "Approve name & convert"\n              : "Convert to team"}`,
    "convert button review label",
  );

  write(file, source);
}

console.log("Public team-name soft review is applied across SIXFL registration routes.");
