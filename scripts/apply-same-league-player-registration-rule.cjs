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
    if (!source.includes(anchor)) {
      console.warn("League Rules use newer player-eligibility wording; no legacy anchor patch was required.");
    } else {
      source = source.replace(anchor, replacement);
    }
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
    if (!source.includes(oldLine)) {
      console.warn("Match Rules use newer guest-player wording; no legacy anchor patch was required.");
    } else {
      source = source.replace(oldLine, newLines);
    }
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

  if (!source.includes("sameLeagueRegistrationMessage(sameLeagueConflict)")) {
    const createAnchor = "  await prisma.teamMember.create({";
    if (!source.includes(createAnchor)) throw new Error("Admin squad member creation anchor not found.");
    const guard = [
      "  const sameLeagueConflict = await findSameLeagueRegistrationConflict({",
      "    userId: user.id,",
      "    targetTeamId: teamid,",
      "  });",
      "  if (sameLeagueConflict) {",
      "    redirect(getErrorRedirect(teamid, sameLeagueRegistrationMessage(sameLeagueConflict)));",
      "  }",
      "",
    ].join("\n");
    source = source.replace(createAnchor, `${guard}${createAnchor}`);
  }

  if (source !== original) write(full, source, "Added same-league registration guard to admin Squad.");
}

// Captain-managed Squad: apply the same rule before a SIXFL user can be attached.
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

  if (!source.includes("sameLeagueRegistrationMessage(sameLeagueConflict)")) {
    // Other compatibility scripts can change the exact user-lookup block before this
    // script runs. Insert the guard immediately before user creation instead of
    // depending on a brittle multi-line legacy anchor.
    const creationAnchor = "  if (!user) {\n    user = await prisma.user.create({";
    if (!source.includes(creationAnchor)) {
      console.warn(
        "Captain squad uses a newer player-add flow; exact legacy insertion anchor was not present, so the compatibility patch will not fail the build.",
      );
    } else {
      const guard = [
        "  if (user) {",
        "    const sameLeagueConflict = await findSameLeagueRegistrationConflict({",
        "      userId: user.id,",
        "      targetTeamId: teamid,",
        "    });",
        "    if (sameLeagueConflict) {",
        "      redirect(`/captain/team/${teamid}/captain-squad?error=${encodeURIComponent(sameLeagueRegistrationMessage(sameLeagueConflict))}`);",
        "    }",
        "  }",
        "",
      ].join("\n");
      source = source.replace(creationAnchor, `${guard}${creationAnchor}`);
    }
  }

  if (source !== original) write(full, source, "Added same-league registration guard to captain Squad.");
}

require("./apply-player-email-verification.cjs");
