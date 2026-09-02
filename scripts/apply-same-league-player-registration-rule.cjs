const fs = require("node:fs");
const path = require("node:path");

function read(relative) {
  const full = path.join(process.cwd(), relative);
  if (!fs.existsSync(full)) throw new Error(`Missing ${relative}`);
  return { full, source: fs.readFileSync(full, "utf8") };
}

function write(full, source, message) {
  fs.writeFileSync(full, source, "utf8");
  console.log(message);
}

// League Rules: one permanent team per league/season; same-league guest use needs SIXFL approval.
{
  const { full, source: original } = read("src/lib/league-rules.ts");
  let source = original;
  const anchor = '      "A player may take part if they are properly registered to the team or are being used as a permitted guest player in accordance with the Match Rules.",';
  const replacement = [
    anchor,
    '      "A player may only be permanently registered to one team within the same SIXFL league and season. A player may be permanently registered to different teams in different SIXFL leagues or competitions.",',
    '      "A player who is permanently registered to another team in the same league and season may only appear for a different team as a guest where SIXFL has approved that guest appearance in advance.",',
    '      "Same-league guest approval is a fixture-specific exception and does not transfer or create a second permanent registration.",',
  ].join("\n");

  if (!source.includes("only be permanently registered to one team within the same SIXFL league")) {
    if (!source.includes(anchor)) throw new Error("League Rules player eligibility anchor not found.");
    source = source.replace(anchor, replacement);
  }
  if (source !== original) write(full, source, "Updated League Rules for same-league player registration.");
}

// Match Rules: tighten guest approval wording while retaining existing guest limits.
{
  const { full, source: original } = read("src/lib/match-rules.ts");
  let source = original;
  const oldLine = '      "Guest players must be agreed with the opposing captain and referee before kick-off.",';
  const newLines = [
    '      "Guest players must be declared before kick-off and must comply with any SIXFL approval requirement.",',
    '      "If a guest player is permanently registered to another team in the same SIXFL league and season, SIXFL approval is required in advance; agreement between captains alone is not sufficient.",',
    '      "An approved same-league guest appearance does not make the player permanently registered to the second team.",',
  ].join("\n");

  if (!source.includes("agreement between captains alone is not sufficient")) {
    if (!source.includes(oldLine)) throw new Error("Match Rules guest-player anchor not found.");
    source = source.replace(oldLine, newLines);
  }
  if (source !== original) write(full, source, "Updated Match Rules for SIXFL-approved same-league guests.");
}

// Full-admin Squad: prevent a second permanent registration in the same league/season.
{
  const relative = "src/app/captain/team/[teamid]/squad/actions.ts";
  const { full, source: original } = read(relative);
  let source = original;

  const importAnchor = 'import { requireCaptain } from "@/lib/requireCaptain";';
  const importBlock = `${importAnchor}\nimport {\n  findSameLeagueRegistrationConflict,\n  sameLeagueRegistrationMessage,\n} from "@/lib/squad/sameLeagueRegistration";`;
  if (!source.includes("findSameLeagueRegistrationConflict")) {
    if (!source.includes(importAnchor)) throw new Error("Admin squad import anchor not found.");
    source = source.replace(importAnchor, importBlock);
  }

  const guardAnchor = `  if (existingMember) {\n    redirect(getErrorRedirect(teamid, "That user is already in this team squad."));\n  }\n\n  await prisma.teamMember.create({`;
  const guardReplacement = `  if (existingMember) {\n    redirect(getErrorRedirect(teamid, "That user is already in this team squad."));\n  }\n\n  const sameLeagueConflict = await findSameLeagueRegistrationConflict({\n    userId: user.id,\n    targetTeamId: teamid,\n  });\n  if (sameLeagueConflict) {\n    redirect(getErrorRedirect(teamid, sameLeagueRegistrationMessage(sameLeagueConflict)));\n  }\n\n  await prisma.teamMember.create({`;
  if (!source.includes("sameLeagueRegistrationMessage(sameLeagueConflict)")) {
    if (!source.includes(guardAnchor)) throw new Error("Admin squad same-league guard anchor not found.");
    source = source.replace(guardAnchor, guardReplacement);
  }

  if (source !== original) write(full, source, "Added same-league registration guard to admin Squad.");
}

// Captain-managed Squad: apply the same rule before an existing SIXFL user can be attached.
{
  const relative = "src/app/captain/team/[teamid]/captain-squad/page.tsx";
  const { full, source: original } = read(relative);
  let source = original;

  const importAnchor = 'import { requireCaptain } from "@/lib/requireCaptain";';
  const importBlock = `${importAnchor}\nimport {\n  findSameLeagueRegistrationConflict,\n  sameLeagueRegistrationMessage,\n} from "@/lib/squad/sameLeagueRegistration";`;
  if (!source.includes("findSameLeagueRegistrationConflict")) {
    if (!source.includes(importAnchor)) throw new Error("Captain squad import anchor not found.");
    source = source.replace(importAnchor, importBlock);
  }

  const anchor = `    if (existingMember) {\n      redirect(\`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent("That player is already in your squad.")}\`);\n    }\n  }\n\n  if (!user) {`;
  const replacement = `    if (existingMember) {\n      redirect(\`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent("That player is already in your squad.")}\`);\n    }\n\n    const sameLeagueConflict = await findSameLeagueRegistrationConflict({\n      userId: user.id,\n      targetTeamId: teamid,\n    });\n    if (sameLeagueConflict) {\n      redirect(\`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent(sameLeagueRegistrationMessage(sameLeagueConflict))}\`);\n    }\n  }\n\n  if (!user) {`;
  if (!source.includes("sameLeagueRegistrationMessage(sameLeagueConflict)")) {
    if (!source.includes(anchor)) throw new Error("Captain squad same-league guard anchor not found.");
    source = source.replace(anchor, replacement);
  }

  if (source !== original) write(full, source, "Added same-league registration guard to captain Squad.");
}

require("./apply-player-email-verification.cjs");
