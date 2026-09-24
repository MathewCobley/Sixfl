const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const file = 'src/lib/sixfl-tv/priority-deductions.ts';
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('require', 'exports', 'module', code)(() => ({}), mod.exports, mod);
const { calculatePriorityDeductions: calculate } = mod.exports;
const now = new Date('2026-09-24T21:30:00Z');
const daysAgo = n => new Date(+now - n * 86400000);
const incident = (id, age, points = 5) => ({ id, teamId: 'team', fixtureId: id, label: id, at: daysAgo(age), points });
const charge = (age, outstandingPence = 1, held = false) => ({ id: 'charge', teamId: 'team', title: 'fee', dueDate: daysAgo(age), outstandingPence, held });
const run = (overdueCharges = [], warnings = [], redCards = []) => calculate({ overdueCharges, warnings, redCards, now });

test('one penny strictly over 14 days costs ten points once, and clearing or holding restores them', () => {
  assert.equal(run([charge(14)]).length, 0);
  assert.equal(run([charge(14.001)])[0].points, 10);
  assert.equal(run([charge(15), charge(30, 4000)]).length, 1);
  assert.equal(run([charge(15, 0), charge(15, 1, true)]).length, 0);
});
test('shin-pad warnings expire individually at 28 days, with a fifteen-point cap', () => {
  const rows = run([], [incident('a', 1), incident('b', 10), incident('c', 20), incident('d', 27), incident('expired', 28), incident('future', -1)]);
  assert.equal(rows.reduce((n, r) => n + r.points, 0), 15);
  assert.equal(rows.length, 4);
  assert.equal(rows.find(r => r.id === 'd').points, 0);
  assert.equal(+rows.find(r => r.id === 'a').expiresAt, +daysAgo(-27));
  assert.equal(run([], [incident('a', 28), incident('b', 29)]).length, 0);
});
test('confirmed red cards have a separate cap and expiry', () => {
  const rows = run([], [incident('warning', 1)], [incident('serious', 1, 20), incident('ordinary', 2, 10), incident('extra', 3, 10), incident('expired', 28, 20)]);
  assert.equal(rows.reduce((n, r) => n + r.points, 0), 35);
  assert.equal(rows.filter(r => r.kind === 'RED_CARD').length, 3);
});
test('all score consumers use deductions and pending payment cannot look settled', () => {
  const score = fs.readFileSync('src/lib/sixfl-tv/priority-score.ts', 'utf8');
  assert.match(score, /reliabilityPoints \+ engagementPoints - deductionPoints/);
  assert.match(score, /getPriorityDeductionDetails\(uniqueTeamIds, db, now\)/);
  assert.match(score, /paymentStillWithinGracePeriod\(dueDate, now\)\) \{\s*paymentPoints = 0;\s*paymentStatus = "PENDING"/);
  const card = fs.readFileSync('src/components/captain/CaptainVeoPriorityCard.tsx', 'utf8');
  assert.match(card, /Payment points not yet earned/);
  assert.match(card, /pending=\{match.paymentStatus === 'PENDING'\}/);
  const action = fs.readFileSync('src/app/(admin)/admin/teams/[id]/priority/actions.ts', 'utf8');
  assert.ok(action.indexOf('await requireAdmin()') < action.indexOf('await prisma.$transaction'));
  assert.match(action, /form.get\("confirmed"\) !== "on"/);
  assert.match(action, /AND "teamId"=\$\{teamId\}/);
  assert.doesNotMatch(action, /UPDATE "PaymentCharge"|DELETE FROM/);
});
