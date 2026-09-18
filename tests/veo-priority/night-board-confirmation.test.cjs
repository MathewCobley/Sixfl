const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const route = fs.readFileSync('src/app/api/admin/fixtures/sixfl-tv/route.ts', 'utf8');
const toggle = fs.readFileSync('src/components/admin/night-board/NightBoardSixflTvToggle.tsx', 'utf8');
const helper = fs.readFileSync('src/lib/veo/night-board.ts', 'utf8');
const history = fs.readFileSync('src/app/(admin)/admin/leagues/[id]/veo-priority/VeoChoiceHistory.tsx', 'utf8');
const nightBoardPriority = fs.readFileSync('src/app/(admin)/admin/night-board/veo-priority-actions.ts', 'utf8');
const retirement = fs.readFileSync(
  'prisma/migrations/20260918143000_retire_legacy_veo_priority_fees/migration.sql',
  'utf8',
);

test('Night Board SIXFL TV selection confirms the real Veo booking', () => {
  assert.match(route, /confirmNightBoardVeoFixture/);
  assert.match(route, /veoBookingConfirmed/);
  assert.match(helper, /INSERT INTO "VeoMatchBooking"/);
  assert.match(helper, /INSERT INTO "VeoMatchBooking"/);
  assert.match(helper, /"sixflTvRecorded" = true/);
  assert.match(helper, /maximum/);
});

test('Night Board contains no legacy Priority charge path', () => {
  assert.match(helper, /noPriorityFees: true/);
  assert.doesNotMatch(helper, /ensureAcceptedVeoCharges|paymentCharge\.create|amountPence:\s*500/);
  assert.match(helper, /initial\.bookingState === 'PLANNED'/);
});

test('retirement migration voids only the dedicated £5 Veo pilot fee and credits genuine receipts', () => {
  assert.match(retirement, /"fixtureId" IS NULL/);
  assert.match(retirement, /"amountPence" = 500/);
  assert.match(retirement, /title LIKE 'Veo Priority — %'/);
  assert.match(retirement, /id LIKE 'veo_%'/);
  assert.match(retirement, /'CREDIT_ADDED'::"TeamCreditLedgerEntryType"/);
  assert.match(retirement, /status = 'VOID'/);
  assert.match(retirement, /COALESCE\(pt\.reference, ''\) <> 'TEAM_CREDIT'/);
  assert.match(retirement, /DELETE FROM "TeamCreditLedgerEntry"/);
  assert.match(retirement, /DROP TRIGGER IF EXISTS "sixfl_veo_receipt_credit"/);
  assert.match(retirement, /DROP TRIGGER IF EXISTS "sixfl_veo_void_guard"/);
  assert.match(retirement, /DROP TRIGGER IF EXISTS "sixfl_veo_void_credit"/);
  assert.match(retirement, /CREATE OR REPLACE FUNCTION sixfl_cancel_veo_with_fixture/);
  assert.doesNotMatch(retirement, /DELETE FROM "PaymentCharge"|TRUNCATE|DROP TABLE/);
});

test('confirmed Night Board booking is visibly locked instead of silently unticked', () => {
  assert.match(toggle, /score-based priority/);
  assert.match(toggle, /disabled=\{loading \|\| saving \|\| locked\}/);
  assert.match(route, /league SIXFL TV Priority page/);
});

test('retired captain Veo requests no longer appear on Night Board', () => {
  assert.match(nightBoardPriority, /return \[\]/);
  assert.doesNotMatch(nightBoardPriority, /FROM "VeoFixtureRequest"/);
});

test('Veo admin shows audited captain choice history', () => {
  assert.match(history, /Veo choice history/);
  assert.match(history, /fixture_veo_choice/);
  assert.match(history, /stop_future_priority/);
  assert.match(history, /team_priority/);
});

test('new wiring stays native and does not add a DOM bridge', () => {
  for (const source of [route, toggle, helper, history, nightBoardPriority]) {
    assert.doesNotMatch(source, /MutationObserver|document\.querySelector|document\.querySelectorAll/);
  }
});
