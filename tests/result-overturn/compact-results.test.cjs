const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./loader.cjs');

// Render the actual captain Fixtures page, including the compact Latest scores
// list reported by the administrator. No providers, writes or real accounts.
test('compact captain results show the original and awarded scores for both captains', async () => {
  const fixture = {
    id: 'fixture', homeTeamId: 'nomads', awayTeamId: 'under', kickoffAt: new Date('2026-09-09T20:15:00Z'),
    homeTeam: { id: 'nomads', name: 'Northallerton Nomads' }, awayTeam: { id: 'under', name: 'Under Sixes' },
    result: { homeScore: 3, awayScore: 0, overturn: { originalHomeScore: 1, originalAwayScore: 4, awardedHomeScore: 3, awardedAwayScore: 0, reasonCode: 'PLAYER_LIMIT' } },
  };
  let teamid = 'nomads';
  let recentQuery;
  const Page = load('src/app/captain/team/[teamid]/fixtures/page.tsx', {
    'next/cache': { revalidatePath() { throw new Error('No writes in a result view'); } },
    'next/navigation': { notFound() { throw new Error('Unexpected not found'); }, redirect() { throw new Error('Unexpected redirect'); } },
    'next/link': { default: p => React.createElement('a', { href: p.href, className: p.className }, p.children), __esModule: true },
    '@/lib/prisma': { prisma: {
      team: { async findUnique() { return { id: teamid, name: 'Captain team', league: null }; } },
      fixture: { async findMany(query) { if (query.where.status === 'SCHEDULED') return []; recentQuery = query; return [fixture]; } },
    } },
    '@/lib/requireCaptain': { async requireCaptain(id) { assert.equal(id, teamid); return { user: { id: 'captain' } }; } },
    '@/lib/teams/kit-colours': { async getTeamKitColours() { return new Map(); } },
    '@/lib/teams/fixture-placeholders': { async fixtureHasPlaceholderTeam() { return false; }, async getFixturePlaceholderTeamIds() { return new Set(); } },
    '@/components/fixtures/TeamShirt': { default: () => null, __esModule: true },
    '@/components/sixfl-tv/SixflTvFixtureBadge': { default: () => null, __esModule: true },
  }).default;
  for (const id of ['nomads', 'under']) {
    teamid = id;
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ teamid }), searchParams: Promise.resolve({}) }));
    assert.match(html, /Latest scores/);
    assert.match(html, /Awarded result/);
    assert.match(html, /Default win awarded to Northallerton Nomads/);
    assert.match(html, /Northallerton Nomads 1–4 Under Sixes/);
    assert.match(html, /Northallerton Nomads 3–0 Under Sixes/);
    assert.match(html, /Player-limit breach/);
    assert.equal(recentQuery.include.result.select.overturn.select.originalHomeScore, true);
    assert.equal(recentQuery.include.result.select.overturn.select.awardedHomeScore, true);
    assert.equal(recentQuery.include.result.select.overturn.select.evidenceNote, undefined);
  }
  fixture.result.overturn = null;
  const ordinary = renderToStaticMarkup(await Page({ params: Promise.resolve({ teamid }), searchParams: Promise.resolve({}) }));
  assert.doesNotMatch(ordinary, /Default win awarded|Original on-pitch result/);
  assert.match(ordinary, />Loss</);
});
