const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const PAGE = 'src/app/captain/team/[teamid]/fixtures/page.tsx';

test('fixture confirmation is owned by the native pre-Veo fixture page again', () => {
  const source = fs.readFileSync(PAGE, 'utf8');

  assert.match(source, /async function confirmFixtureAction\(formData: FormData\)/);
  assert.match(source, /<form action=\{confirmFixtureAction\}/);
  assert.match(source, /Yes — we can play/);
  assert.match(source, /markFixtureUnavailableAction/);
  assert.match(source, /grid gap-3 sm:grid-cols-2/);

  assert.doesNotMatch(source, /CaptainFixtureConfirmation/);
  assert.doesNotMatch(source, /FixtureVeoConfirmationForm/);
  assert.doesNotMatch(source, /readFixtureVeoOffer/);
  assert.doesNotMatch(source, /confirmFixtureWithVeoAction/);
  assert.doesNotMatch(source, /SIXFL TV Priority Score|filming fee|confirmed for filming/);
});

test('the native Yes action retains confirmation history used by the Priority score', () => {
  const source = fs.readFileSync(PAGE, 'utf8');

  assert.match(source, /allowLateConfirmation: true/);
  assert.match(source, /status: "CONFIRMED"/);
  assert.match(source, /const confirmedAt = existing\?\.confirmedAt \?\? new Date\(\)/);
  assert.match(source, /confirmedAt,/);
  assert.match(source, /confirmedByUserId: access\.user\?\.id \?\? null/);
  assert.match(source, /revalidateFixtureConfirmationPaths\(teamid\)/);
  assert.match(source, /saved: "confirmed"/);
});

test('restoring the confirmation box preserves fixture safety and awarded-result UI', () => {
  const source = fs.readFileSync(PAGE, 'utf8');
  const ast = ts.createSourceFile(PAGE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  assert.equal(ast.parseDiagnostics.length, 0, 'The restored fixture page must parse');
  assert.match(source, /fixtureHasPlaceholderTeam\(fixtureId\)/);
  assert.match(source, /isFixtureResponseLocked\(fixture\.kickoffAt\)/);
  assert.match(source, /overturn:\s*\{\s*select:\s*RESULT_OVERTURN_SUMMARY_SELECT/);
  assert.match(source, /fixture\.result!\.overturn\s*\?\s*"Awarded result"/);
  assert.doesNotMatch(source, /MutationObserver|document\.querySelector|document\.querySelectorAll/);
});

test('Veo-era confirmation wrapper files are retired', () => {
  for (const path of [
    'src/components/captain/CaptainFixtureConfirmation.tsx',
    'src/components/captain/FixtureVeoConfirmationForm.tsx',
    'src/app/captain/team/[teamid]/veo-priority/fixture-actions.ts',
  ]) {
    assert.equal(fs.existsSync(path), false, `${path} should stay retired`);
  }
});
