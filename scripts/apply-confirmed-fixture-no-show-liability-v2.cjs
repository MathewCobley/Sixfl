const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
}

function write(file, source) {
  fs.writeFileSync(path.join(root, ...file.split("/")), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// Version and publish the policy in the authoritative rules.
{
  const file = "src/lib/league-rules.ts";
  let source = read(file);
  source = source.replace(
    'export const LEAGUE_RULES_VERSION = "2.1";',
    'export const LEAGUE_RULES_VERSION = "2.2";',
  );
  source = replaceRequired(
    source,
    '      "A no-show or repeated avoidable late cancellation may also result in a forfeit, disciplinary action or review of the team\'s place in the league.",',
    [
      '      "Where a team has confirmed a fixture and then fails to attend without SIXFL agreeing a cancellation or rearrangement, that team is responsible for both its own match fee and the opposing team\'s match fee.",',
      '      "The opposing team will have no match fee due for a confirmed-fixture no-show caused by the other team. Where the opposing team has already paid, SIXFL will return the amount received as team credit where applicable.",',
      '      "A no-show may also result in a forfeit, disciplinary action or review of the team\'s place in the league. Where SIXFL records a forfeit and does not expressly determine a different score, the administrative forfeit result is 3–0.",',
    ].join("\n"),
    "league confirmed no-show rule",
  );
  write(file, source);
}

{
  const file = "src/lib/league-agreement.ts";
  let source = read(file);
  source = source.replace(
    'export const LEAGUE_AGREEMENT_VERSION = "2.0";',
    'export const LEAGUE_AGREEMENT_VERSION = "2.1";',
  );
  source = replaceRequired(
    source,
    '      "A no-show or repeated avoidable late cancellation may result in a forfeit, disciplinary action or review of the team\'s place in the league.",',
    [
      '      "If a team confirms a fixture and then fails to attend without SIXFL agreeing a cancellation or rearrangement, that team is responsible for both its own match fee and the opposing team\'s match fee.",',
      '      "The opposing team has no match fee due for that confirmed-fixture no-show; if it has already paid, SIXFL will return the amount received as team credit where applicable.",',
      '      "A no-show may also result in a forfeit, disciplinary action or review of the team\'s place in the league.",',
    ].join("\n"),
    "agreement confirmed no-show rule",
  );
  write(file, source);
}

{
  const file = "src/app/captain/team/[teamid]/guide/page.tsx";
  let source = read(file);
  source = replaceRequired(
    source,
    '      "A no-show or repeated avoidable late cancellation may lead to a forfeit, disciplinary action or review of the team\'s place in the league.",',
    [
      '      "If your team has confirmed a fixture and then does not attend without SIXFL agreeing a cancellation or rearrangement, your team is responsible for both its own match fee and the opposition\'s match fee.",',
      '      "The opposition will not be charged for a confirmed-fixture no-show caused by your team; any amount they have already paid will be returned as team credit where applicable.",',
      '      "A no-show may also lead to a forfeit, disciplinary action or review of the team\'s place in the league.",',
    ].join("\n"),
    "captain confirmed no-show guidance",
  );
  write(file, source);
}

// Reuse the existing audited team-responsible fixture-outcome accounting. It
// already does exactly what this policy requires: responsible team = both fees,
// innocent team = no fee, paid innocent standard team = credit.
{
  const file = "src/lib/fixtures/abandonment.ts";
  let source = read(file);

  if (!source.includes('value: "NO_SHOW"')) {
    source = replaceRequired(
      source,
      'export const FIXTURE_ABANDONMENT_REASONS = [\n',
      [
        'export const FIXTURE_ABANDONMENT_REASONS = [',
        '  {',
        '    value: "NO_SHOW",',
        '    label: "Confirmed team failed to attend / no-show",',
        '    teamResponsible: true,',
        '  },',
      ].join("\n") + "\n",
      "confirmed no-show outcome reason",
    );
  }

  if (!source.includes('captainConfirmations: {')) {
    source = replaceRequired(
      source,
      '      result: {\n        select: { homeScore: true, awayScore: true },\n      },',
      [
        '      result: {',
        '        select: { homeScore: true, awayScore: true },',
        '      },',
        '      captainConfirmations: {',
        '        select: { teamId: true, status: true },',
        '      },',
      ].join("\n"),
      "fixture confirmation selection",
    );
  }

  source = source.replace(
    '    throw new Error("Choose the team whose conduct caused the abandonment.");',
    '    throw new Error("Choose the team responsible for the abandonment or no-show.");',
  );

  if (!source.includes('responsibleConfirmation.status !== "CONFIRMED"')) {
    source = replaceRequired(
      source,
      '  const innocentTeam = responsibleTeam\n    ? responsibleTeam.id === fixture.homeTeam.id\n      ? fixture.awayTeam\n      : fixture.homeTeam\n    : null;\n',
      [
        '  const innocentTeam = responsibleTeam',
        '    ? responsibleTeam.id === fixture.homeTeam.id',
        '      ? fixture.awayTeam',
        '      : fixture.homeTeam',
        '    : null;',
        '',
        '  if (reason.value === "NO_SHOW" && responsibleTeam) {',
        '    const responsibleConfirmation = fixture.captainConfirmations.find(',
        '      (confirmation) => confirmation.teamId === responsibleTeam.id,',
        '    );',
        '    if (!responsibleConfirmation || responsibleConfirmation.status !== "CONFIRMED") {',
        '      throw new Error(',
        '        "The double match-fee no-show rule only applies where the responsible team had confirmed this fixture.",',
        '      );',
        '    }',
        '  }',
      ].join("\n") + "\n",
      "confirmed no-show validation",
    );
  }

  if (!source.includes('const isNoShow = reason.value === "NO_SHOW";')) {
    source = replaceRequired(
      source,
      '  const responsibleFinalChargePence =\n',
      '  const isNoShow = reason.value === "NO_SHOW";\n\n  const responsibleFinalChargePence =\n',
      "no-show wording flag",
    );
  }

  source = source.replaceAll(
    '`Abandoned match fees • ${responsibleTeam.name} vs ${innocentTeam.name}`',
    '`${isNoShow ? "No-show match fees" : "Abandoned match fees"} • ${responsibleTeam.name} vs ${innocentTeam.name}`',
  );
  source = source.replaceAll(
    '`${responsibleTeam.name} is responsible for both match fees following a referee-abandoned fixture.`',
    'isNoShow\n            ? `${responsibleTeam.name} is responsible for both match fees after failing to attend a confirmed fixture.`\n            : `${responsibleTeam.name} is responsible for both match fees following a referee-abandoned fixture.`',
  );
  source = source.replaceAll(
    '"Match fee waived because the opposing team caused the fixture to be abandoned."',
    'isNoShow\n                ? "Match fee waived because the opposing team failed to attend a confirmed fixture."\n                : "Match fee waived because the opposing team caused the fixture to be abandoned."',
  );
  source = source.replaceAll(
    '"Match fee neutralised by team credit because the opposing team caused the fixture to be abandoned."',
    'isNoShow\n                ? "Match fee neutralised by team credit because the opposing team failed to attend a confirmed fixture."\n                : "Match fee neutralised by team credit because the opposing team caused the fixture to be abandoned."',
  );
  source = source.replace(
    '    reason: "Fixture was abandoned and the match-fee liability was recalculated by SIXFL.",',
    '    reason: isNoShow\n      ? "Confirmed fixture no-show: match-fee liability was recalculated by SIXFL."\n      : "Fixture was abandoned and the match-fee liability was recalculated by SIXFL.",',
  );

  source = source.replace(
    '      `The referee abandoned ${fixtureLabel}.`,\n      `Reason: ${reasonLabel}.`,',
    '      isNoShow\n        ? `SIXFL has recorded ${responsibleTeam.name} as a no-show for the confirmed fixture ${fixtureLabel}.`\n        : `The referee abandoned ${fixtureLabel}.`,\n      `Reason: ${reasonLabel}.`,',
  );
  source = source.replace(
    '      `Under the SIXFL abandoned-match rule, ${responsibleTeam.name} is responsible for both its own match fee (${formatMoney(responsibleOriginalFeePence ?? 0)}) and ${innocentTeam.name}\'s match fee (${formatMoney(innocentOriginalFeePence ?? 0)}).`,',
    '      isNoShow\n        ? `Under the SIXFL confirmed-fixture no-show rule, ${responsibleTeam.name} is responsible for both its own match fee (${formatMoney(responsibleOriginalFeePence ?? 0)}) and ${innocentTeam.name}\'s match fee (${formatMoney(innocentOriginalFeePence ?? 0)}).`\n        : `Under the SIXFL abandoned-match rule, ${responsibleTeam.name} is responsible for both its own match fee (${formatMoney(responsibleOriginalFeePence ?? 0)}) and ${innocentTeam.name}\'s match fee (${formatMoney(innocentOriginalFeePence ?? 0)}).`,',
  );
  source = source.replace(
    '      "The league/result outcome is separate and will be decided by SIXFL after reviewing the abandonment.",',
    '      isNoShow\n        ? "The league/result outcome is separate. SIXFL may record a forfeit in accordance with the League Rules."\n        : "The league/result outcome is separate and will be decided by SIXFL after reviewing the abandonment.",',
  );
  source = source.replace(
    '      subject: `Match abandoned: fee decision for ${fixtureLabel}`,',
    '      subject: isNoShow\n        ? `Confirmed fixture no-show: fee decision for ${fixtureLabel}`\n        : `Match abandoned: fee decision for ${fixtureLabel}`,',
  );
  source = source.replace(
    '      originLabel: "Abandoned match fee decision",',
    '      originLabel: isNoShow ? "Confirmed fixture no-show fee decision" : "Abandoned match fee decision",',
  );

  source = source.replace(
    '      `The referee abandoned ${fixtureLabel}.`,\n      `Reason: ${reasonLabel}.`,\n      "",\n      `SIXFL has recorded ${responsibleTeam.name} as the team responsible for the abandonment. You will not be charged for this fixture.`,',
    '      isNoShow\n        ? `SIXFL has recorded ${responsibleTeam.name} as a no-show for the confirmed fixture ${fixtureLabel}.`\n        : `The referee abandoned ${fixtureLabel}.`,\n      `Reason: ${reasonLabel}.`,\n      "",\n      isNoShow\n        ? `${responsibleTeam.name} is responsible for both match fees. You will not be charged for this fixture.`\n        : `SIXFL has recorded ${responsibleTeam.name} as the team responsible for the abandonment. You will not be charged for this fixture.`,',
  );
  source = source.replace(
    '        : "No payment is due from your team for this abandoned fixture.",',
    '        : isNoShow\n          ? "No payment is due from your team for this fixture."\n          : "No payment is due from your team for this abandoned fixture.",',
  );
  source = source.replace(
    '      subject: `Match abandoned: your fee has been waived for ${fixtureLabel}`,',
    '      subject: isNoShow\n        ? `Confirmed fixture no-show: your fee has been waived for ${fixtureLabel}`\n        : `Match abandoned: your fee has been waived for ${fixtureLabel}`,',
  );

  write(file, source);
}

{
  const file = "src/components/referee/AbandonedMatchForm.tsx";
  let source = read(file);
  source = source.replace(
    '<span>Match abandoned?</span>',
    '<span>Match abandoned / confirmed team no-show?</span>',
  );
  source = source.replace(
    '<span className="text-xs font-normal text-red-100/55">Use only if the referee ended the match early</span>',
    '<span className="text-xs font-normal text-red-100/55">Use for a referee abandonment or a confirmed team that does not attend</span>',
  );
  source = source.replace(
    '          If one team&apos;s conduct caused the abandonment, SIXFL rules make that team responsible for <strong>both match fees</strong>.',
    '          If one team&apos;s conduct caused an abandonment, or a team confirmed the fixture and then failed to attend, SIXFL rules make that team responsible for <strong>both match fees</strong>.',
  );
  source = source.replace(
    '<span className="font-semibold text-white">Reason for abandonment</span>',
    '<span className="font-semibold text-white">Fixture outcome / reason</span>',
  );
  source = source.replace(
    '<span className="ml-2 text-xs text-white/40">Required when one team&apos;s conduct caused it</span>',
    '<span className="ml-2 text-xs text-white/40">Required for a team-responsible abandonment or no-show</span>',
  );
  source = source.replace(
    '            I confirm the referee abandoned this match. I understand this removes any entered score as the official result, applies the fee rule where a responsible team is selected, and emails both teams.',
    '            I confirm either that the referee abandoned this match or that the selected team failed to attend after confirming the fixture. I understand this removes any entered score as the official result, applies the relevant fee rule and emails both teams.',
  );
  source = source.replace('          Mark match abandoned', '          Record fixture outcome');
  write(file, source);
}

{
  const file = "src/app/(public)/referee/abandonment-actions.ts";
  let source = read(file);
  source = source.replace(
    '    throw new Error("Confirm that the referee abandoned the match before applying the abandonment decision.");',
    '    throw new Error("Confirm the referee abandonment or confirmed-team no-show before applying the fixture outcome.");',
  );
  write(file, source);
}

{
  const file = "docs/fixture-abandonment-workflow.md";
  let source = read(file);
  if (!source.includes("Confirmed team no-shows use the same audited fee-liability machinery")) {
    source += [
      "",
      "## Confirmed team no-show",
      "",
      "Confirmed team no-shows use the same audited fee-liability machinery, but are recorded with the distinct `NO_SHOW` reason. The double-fee rule is only accepted when the responsible team's fixture confirmation is recorded as `CONFIRMED`.",
      "",
      "For a confirmed no-show, SIXFL charges the absent team both match fees, waives the attending team's fee, converts any amount already received from an attending standard team to team credit, and leaves the competition/result decision for SIXFL to determine under the League Rules.",
      "",
    ].join("\n");
  }
  write(file, source);
}

console.log("Confirmed-fixture no-show liability applied across rules, captain guidance and audited fixture outcome accounting.");
