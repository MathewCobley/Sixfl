const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const pagePath = path.join(root, "src", "app", "(public)", "referee", "night", "[id]", "page.tsx");

let source = fs.readFileSync(pagePath, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in referee night page.`);
  }
  source = source.replace(before, after);
}

if (!source.includes('import AbandonedMatchForm from "@/components/referee/AbandonedMatchForm";')) {
  replaceOnce(
    'import DisciplinaryNoteForm from "@/components/referee/DisciplinaryNoteForm";',
    [
      'import DisciplinaryNoteForm from "@/components/referee/DisciplinaryNoteForm";',
      'import AbandonedMatchForm from "@/components/referee/AbandonedMatchForm";',
    ].join("\n"),
    "abandonment component import",
  );
}

if (!source.includes('import { getFixtureAbandonments } from "@/lib/fixtures/abandonment";')) {
  replaceOnce(
    'import { requireReferee } from "@/lib/admin";',
    [
      'import { requireReferee } from "@/lib/admin";',
      'import { getFixtureAbandonments } from "@/lib/fixtures/abandonment";',
    ].join("\n"),
    "abandonment data import",
  );
}

replaceOnce(
  '    case "discipline":\n      return "Disciplinary note recorded.";',
  [
    '    case "discipline":',
    '      return "Disciplinary note recorded.";',
    '    case "abandoned":',
    '      return "Match marked as abandoned. Fee changes have been applied and both teams have been notified where applicable.";',
  ].join("\n"),
  "abandonment saved message",
);

replaceOnce(
  '  const disciplinaryNotesByFixture = groupDisciplinaryNotesByFixture(disciplinaryNotes);\n  const allFixturesHaveResults = fixtures.length > 0 && fixtures.every((fixture) => fixture.result);',
  [
    '  const disciplinaryNotesByFixture = groupDisciplinaryNotesByFixture(disciplinaryNotes);',
    '  const abandonmentsByFixture = await getFixtureAbandonments(fixtureIds);',
    '  const allFixturesHaveResults =',
    '    fixtures.length > 0 &&',
    '    fixtures.every((fixture) => fixture.result || abandonmentsByFixture.has(fixture.id));',
  ].join("\n"),
  "abandonment completion state",
);

replaceOnce(
  '              const fixtureDisciplinaryNotes = disciplinaryNotesByFixture.get(fixture.id) ?? [];\n              const fixtureLabel = `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`;',
  [
    '              const fixtureDisciplinaryNotes = disciplinaryNotesByFixture.get(fixture.id) ?? [];',
    '              const abandonment = abandonmentsByFixture.get(fixture.id) ?? null;',
    '              const fixtureLabel = `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`;',
  ].join("\n"),
  "fixture abandonment lookup",
);

replaceOnce(
  '{fixture.result ? `Current result: ${fixture.result.homeScore}-${fixture.result.awayScore}${fixture.result.isDisputed ? " · disputed" : ""}` : "No result entered"}',
  '{abandonment ? "Match abandoned · result to be decided by SIXFL" : fixture.result ? `Current result: ${fixture.result.homeScore}-${fixture.result.awayScore}${fixture.result.isDisputed ? " · disputed" : ""}` : "No result entered"}',
  "fixture abandonment status copy",
);

if (!source.includes("<AbandonedMatchForm")) {
  replaceOnce(
    '                  <div className="space-y-3 px-4 py-4 sm:px-6 sm:py-5">\n                    {locked ? (',
    [
      '                  <div className="space-y-3 px-4 py-4 sm:px-6 sm:py-5">',
      '                    <AbandonedMatchForm',
      '                      refereeNightId={night.id}',
      '                      fixtureId={fixture.id}',
      '                      homeTeam={{ id: fixture.homeTeam.id, name: fixture.homeTeam.name }}',
      '                      awayTeam={{ id: fixture.awayTeam.id, name: fixture.awayTeam.name }}',
      '                      abandonment={abandonment}',
      '                      locked={locked}',
      '                    />',
      '',
      '                    {locked || abandonment ? (',
    ].join("\n"),
    "abandonment form placement",
  );
}

replaceOnce(
  '<h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">1. Score locked</h3>\n                        <p className="mt-3 text-sm text-white/65">\n                          {fixture.result ? `Final score recorded: ${fixture.result.homeScore}-${fixture.result.awayScore}.` : "No score was recorded before submission."}\n                        </p>',
  [
    '<h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">',
    '                          {abandonment ? "1. Match outcome" : "1. Score locked"}',
    '                        </h3>',
    '                        <p className="mt-3 text-sm text-white/65">',
    '                          {abandonment',
    '                            ? "The referee abandoned this fixture. No official score is recorded; SIXFL will decide the result and league outcome separately."',
    '                            : fixture.result',
    '                              ? `Final score recorded: ${fixture.result.homeScore}-${fixture.result.awayScore}.`',
    '                              : "No score was recorded before submission."}',
    '                        </p>',
  ].join("\n"),
  "abandonment score lock copy",
);

fs.writeFileSync(pagePath, source, "utf8");
console.log("Applied referee abandoned-match outcome, fee and notification workflow UI.");
