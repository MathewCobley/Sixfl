const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const route = fs.readFileSync('src/app/api/admin/fixtures/sixfl-tv/route.ts', 'utf8');
const toggle = fs.readFileSync('src/components/admin/night-board/NightBoardSixflTvToggle.tsx', 'utf8');
const helper = fs.readFileSync('src/lib/veo/night-board.ts', 'utf8');
const history = fs.readFileSync('src/app/(admin)/admin/leagues/[id]/veo-priority/VeoChoiceHistory.tsx', 'utf8');
const nightBoardPriority = fs.readFileSync('src/app/(admin)/admin/night-board/veo-priority-actions.ts', 'utf8');

test('Night Board SIXFL TV selection confirms the real Veo booking', () => {
  assert.match(route, /confirmNightBoardVeoFixture/);
  assert.match(route, /veoBookingConfirmed/);
  assert.match(helper, /INSERT INTO "VeoMatchBooking"/);
  assert.match(helper, /status = 'ACCEPTED'/);
  assert.match(helper, /"sixflTvRecorded" = true/);
  assert.match(helper, /maximum/);
});

test('accepted Veo Priority is charged as soon as Night Board confirms filming', () => {
  assert.match(helper, /ensureAcceptedVeoCharges/);
  assert.match(helper, /paymentCharge\.create/);
  assert.match(helper, /amountPence: 500/);
  assert.match(helper, /dueDate: fixture\.kickoffAt/);
  assert.match(helper, /chargeTiming: 'booking_confirmation'/);
  assert.match(helper, /If the recording fails, this charge is voided and any payment received is returned to team credit/);
  assert.match(helper, /initial\.bookingState === 'PLANNED'/);
});

test('confirmed Night Board booking is visibly locked instead of silently unticked', () => {
  assert.match(toggle, /captain choice locked/);
  assert.match(toggle, /disabled=\{loading \|\| saving \|\| locked\}/);
  assert.match(route, /Cancel it from the league Veo Priority page/);
});

test('Night Board only shows Veo Priority for a team still in that fixture', () => {
  assert.match(
    nightBoardPriority,
    /r\."teamId" = f\."homeTeamId" OR r\."teamId" = f\."awayTeamId"/,
  );
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
