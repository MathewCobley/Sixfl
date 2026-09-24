const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { sourceLoader } = require('./load.cjs');
const file = 'src/app/api/admin/leagues/[id]/competition/route.ts';
function harness(authorized = true, failure = null) {
  const calls = [];
  class SeasonActivationError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const load = sourceLoader({
    '@/lib/requireAdmin': { requireAdmin: async () => { calls.push('auth'); if (!authorized) throw new Error('Forbidden'); } },
    '@/lib/league-competitions': {
      getCompetitionSummaryForLeague: async () => { calls.push('read'); return {}; },
      createCompetitionForLeague: async () => { calls.push('ensure'); },
      createNextLeagueSeason: async (input) => { calls.push(['create', input]); return { leagueId: 'draft', slug: 'draft' }; },
    },
    '@/lib/leagues/season-activation': {
      SeasonActivationError,
      makeLeagueSeasonCurrent: async (input) => {
        calls.push(['switch', input]);
        if (failure) throw new SeasonActivationError('Review current season', failure);
        return { leagueId: input.leagueId, slug: 'winter', previousSlug: 'summer', teamIds: ['t1'] };
      },
    },
    'next/cache': { revalidatePath: (...args) => { calls.push(['revalidate', ...args]); } },
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  });
  const route = load(file);
  return { calls, get: () => route.GET({}, { params: Promise.resolve({ id: 'new' }) }),
    post: (body) => route.POST({ json: async () => body }, { params: Promise.resolve({ id: 'new' }) }) };
}

test('both season endpoints authenticate before reading or mutating', async () => {
  for (const method of ['get', 'post']) {
    const h = harness(false); await assert.rejects(h[method]({ action: 'makeCurrent', confirmed: true, expectedCurrentLeagueId: 'old' }), /Forbidden/);
    assert.deepEqual(h.calls, ['auth']);
  }
});
test('creation uses only private creation service, never activation', async () => {
  const h = harness(); const result = await h.post({ action: 'createSeason', seasonName: 'Winter', copyTeams: false });
  assert.equal(result.status, 200); assert.ok(h.calls.some(c => Array.isArray(c) && c[0] === 'create' && c[1].copyTeams === false));
  assert.ok(!h.calls.some(c => Array.isArray(c) && c[0] === 'switch'));
});
test('switch requires literal confirmation and an explicit current-season expectation', async () => {
  for (const body of [
    { action: 'makeCurrent' },
    { action: 'makeCurrent', confirmed: 'true', expectedCurrentLeagueId: 'old' },
    { action: 'makeCurrent', confirmed: true },
    { action: 'makeCurrent', confirmed: true, expectedCurrentLeagueId: {} },
  ]) {
    const h = harness(); assert.equal((await h.post(body)).status, 400); assert.deepEqual(h.calls, ['auth']);
  }
});
test('deliberate switch passes reviewed identity and refreshes public/captain/player views', async () => {
  const h = harness(); const result = await h.post({ action: 'makeCurrent', confirmed: true, expectedCurrentLeagueId: 'old' });
  assert.equal(result.status, 200);
  assert.deepEqual(h.calls[1], ['switch', { leagueId: 'new', expectedCurrentLeagueId: 'old', confirmed: true }]);
  assert.ok(h.calls.some(c => Array.isArray(c) && c[1] === '/captain/team/t1'));
  assert.ok(h.calls.some(c => Array.isArray(c) && c[1] === '/player/team/t1'));
  assert.ok(h.calls.some(c => Array.isArray(c) && c[1] === '/leagues/summer'));
});
test('stale and private failures retain meaningful error codes', async () => {
  for (const status of [400, 409]) {
    const h = harness(true, status); assert.equal((await h.post({ action: 'makeCurrent', confirmed: true, expectedCurrentLeagueId: 'old' })).status, status);
    assert.equal(h.calls.length, 2);
  }
});
test('season preparation contains no outgoing-message or financial services, before and after prebuild', () => {
  for (const file of ['src/lib/leagues/season-activation.ts', 'src/lib/league-competitions.ts']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /queueDirectNotification|sendEmail|sendSms|paymentCharge\.(create|update)|publishFixture/);
  }
  const migration = fs.readFileSync('prisma/migrations/20260924233000_preserve_private_and_historical_seasons/migration.sql', 'utf8');
  assert.match(migration, /IS NOT DISTINCT FROM OLD\."leagueId"/);
  assert.match(migration, /season\."competitionId" IS DISTINCT FROM target_competition_id/);
});
