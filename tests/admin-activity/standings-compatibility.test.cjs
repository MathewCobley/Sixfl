const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load.cjs');

for (const doublePoints of [false, true]) {
  test(`standings reads the doublePoints scalar and retains ${doublePoints ? 'double' : 'normal'} scoring`, async () => {
    const teams = [{ id: 'a', name: 'Team A', logoUrl: null }, { id: 'b', name: 'Team B', logoUrl: null }];
    const prisma = {
      team: { findMany: async () => teams },
      fixture: { findMany: async (args) => {
        assert.equal(args.include.doublePoints, undefined, 'scalars must not be used as included relations');
        assert.ok(args.include.result);
        assert.equal(args.select, undefined, 'all scalar fields remain selected by default');
        return [{ homeTeamId: 'a', awayTeamId: 'b', homeTeam: teams[0], awayTeam: teams[1],
          kickoffAt: new Date('2026-09-22T19:00:00Z'), doublePoints,
          result: { homeScore: 4, awayScore: 1 } }];
      } },
    };
    const { getLeagueTable } = loadSource('src/lib/leagueTable.ts', {
      '@/lib/prisma': { prisma },
      '@/lib/teams/fixture-placeholders': { getFixturePlaceholderTeamIds: async () => new Set() },
    });
    const rows = await getLeagueTable('league', { teamIds: ['a', 'b'] });
    assert.equal(rows[0].points, doublePoints ? 6 : 3);
    assert.equal(rows[0].played, 1);
    assert.equal(rows[0].goalsFor, 4);
    assert.equal(rows[0].doublePointsPlayed, doublePoints ? 1 : 0);
  });
}
