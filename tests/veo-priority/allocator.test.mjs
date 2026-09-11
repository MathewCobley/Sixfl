import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateVeoNight, veoFee, normaliseVeoPitch } from '../../src/lib/veo/allocator.ts';
const settings = { enabled: true, venueId: 'venue', pitch: 'Pitch 1', maxMatches: 3 };
function fixture(id, minutes, pitch = '1', overrides = {}) {
  return { id, kickoffMs: minutes * 60000, durationMinutes: 40, venueId: 'venue', pitch,
    homeTeamId: id + '-a', awayTeamId: id + '-b', homePriority: false, awayPriority: false,
    locked: false, eligible: true, filmed: false, ...overrides };
}
test('disabled means no allocation, even with missing configuration', () => {
  assert.deepEqual(allocateVeoNight([fixture('a', 0)], { ...settings, enabled: false, pitch: '' }), []);
});
test('£40/£45 matrix is independent for each team; free stays free', () => {
  for (const priority of [false, true]) for (const allocated of [false, true]) {
    const q = veoFee(4000, priority, allocated);
    assert.equal(q.totalPence, priority && allocated ? 4500 : 4000);
    assert.equal(veoFee(0, priority, allocated).totalPence, 0);
  }
  assert.equal(veoFee(3700, true, true).totalPence, 4200);
  for (const amount of [-1, 0.5, NaN, Infinity]) assert.throws(() => veoFee(amount, true, true));
});
test('normalises historic pitch labels without inventing a pitch', () => {
  assert.equal(normaliseVeoPitch(' Pitch Pitch 1 '), '1');
  assert.equal(normaliseVeoPitch(null), '');
  assert.deepEqual(allocateVeoNight([fixture('a', 0, '2')], settings), []);
});
test('prefers Priority-v-Priority at the same time without changing input', () => {
  const matches = [fixture('a', 0, '1', { homePriority: true }), fixture('b', 0, '2', { homePriority: true, awayPriority: true })];
  const before = structuredClone(matches);
  assert.deepEqual(allocateVeoNight(matches, settings), [{ fixtureId: 'b', swapWithId: 'a', pitch: '1' }]);
  assert.deepEqual(matches, before);
});
test('fewer past filmed games wins between equally prioritised matches', () => {
  const matches = [fixture('a', 0, '1', { homePriority: true }), fixture('b', 0, '2', { homePriority: true })];
  assert.equal(allocateVeoNight(matches, settings, { 'a-a': { count: 3, lastMs: 1 } })[0].fixtureId, 'b');
});
test('oldest filming wins when appearance counts tie', () => {
  const matches = [fixture('a', 0), fixture('b', 0, '2')];
  const history = { 'a-a': { count: 1, lastMs: 100 }, 'b-a': { count: 1, lastMs: 10 } };
  assert.equal(allocateVeoNight(matches, settings, history)[0].fixtureId, 'b');
});
test('chooses the best three slots across the whole night', () => {
  const matches = [fixture('a', 0), fixture('b', 40, '1', { homePriority: true }), fixture('c', 80, '1', { homePriority: true }), fixture('d', 120, '1', { homePriority: true, awayPriority: true })];
  assert.deepEqual(allocateVeoNight(matches, settings).map(c => c.fixtureId), ['b', 'c', 'd']);
});
test('six fixtures on two pitches produce three choices and preserve schedule', () => {
  const matches = Array.from({ length: 6 }, (_, n) => fixture(String(n), Math.floor(n / 2) * 40, String(n % 2 + 1), { homePriority: n % 2 === 1 }));
  const choices = allocateVeoNight(matches, settings);
  assert.deepEqual(choices.map(c => c.fixtureId), ['1', '3', '5']);
  for (const c of choices) {
    const picked = matches.find(f => f.id === c.fixtureId), displaced = matches.find(f => f.id === c.swapWithId);
    assert.equal(picked.kickoffMs, displaced.kickoffMs); assert.equal(picked.venueId, displaced.venueId);
  }
});
test('published/billed camera fixtures are immutable and reserve filmed capacity', () => {
  const matches = [fixture('a', 0, '1', { locked: true, filmed: true }), fixture('x', 0, '2', { homePriority: true, awayPriority: true }), fixture('b', 40), fixture('c', 80), fixture('d', 120)];
  const choices = allocateVeoNight(matches, settings);
  assert.equal(choices.length, 2); assert.ok(choices.every(c => c.fixtureId !== 'a' && c.fixtureId !== 'x'));
});
test('never moves a billed candidate or takes a placeholder as filmed fixture', () => {
  const matches = [fixture('a', 0), fixture('b', 0, '2', { locked: true, homePriority: true, awayPriority: true }), fixture('c', 0, '3', { eligible: false, homePriority: true, awayPriority: true })];
  assert.equal(allocateVeoNight(matches, settings)[0].fixtureId, 'a');
});
test('never swaps across venue, kickoff time, or duration', () => {
  const matches = [fixture('a', 0), fixture('b', 0, '2', { venueId: 'other', homePriority: true }), fixture('c', 10, '2', { homePriority: true }), fixture('d', 0, '3', { durationMinutes: 30, homePriority: true })];
  assert.equal(allocateVeoNight(matches, settings)[0].fixtureId, 'a');
});
test('null venue is an explicit scope, not all venues', () => {
  assert.deepEqual(allocateVeoNight([fixture('a', 0)], { ...settings, venueId: null }), []);
});
test('detects duplicate physical camera bookings and duplicate IDs', () => {
  assert.throws(() => allocateVeoNight([fixture('a', 0, '1'), fixture('b', 0, 'Pitch 1')], settings), /double-booked/);
  assert.throws(() => allocateVeoNight([fixture('a', 0), fixture('a', 40)], settings), /Duplicate/);
});
test('interval scheduling avoids overlapping camera recordings', () => {
  const matches = [fixture('a', 0), fixture('long', 20, '1', { durationMinutes: 80 }), fixture('c', 80)];
  assert.deepEqual(allocateVeoNight(matches, settings).map(c => c.fixtureId), ['a', 'c']);
});
test('locked intervals also prevent overlapping allocations', () => {
  const matches = [fixture('a', 0, '1', { locked: true, filmed: true, durationMinutes: 80 }), fixture('b', 40), fixture('c', 80)];
  assert.deepEqual(allocateVeoNight(matches, settings).map(c => c.fixtureId), ['c']);
});
test('stable output regardless of database input ordering', () => {
  const matches = [fixture('a', 0), fixture('b', 0, '2'), fixture('c', 40), fixture('d', 40, '2')];
  assert.deepEqual(allocateVeoNight(matches, settings), allocateVeoNight([...matches].reverse(), settings));
});
