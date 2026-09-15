const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./loader.cjs');
const noopComponent = { default: () => null, __esModule: true };

// Real route/component rendering with read-only boundary doubles, not a replica
// of the requested card. Used before/after prebuild and by the browser checks.
async function renderCaptainView({ kind = 'overview', teamid = 'nomads', awarded = true, prediction = [1, 4], alias = false, allowed = true } = {}) {
  const homeId = alias ? 'nomads-past' : 'nomads';
  const homeTeam = { id: homeId, name: 'Northallerton Nomads', logoUrl: null };
  const awayTeam = { id: 'under', name: 'Under Sixes', logoUrl: null };
  const fixture = {
    id: 'test-fixture', homeTeamId: homeId, awayTeamId: 'under',
    homeTeam, awayTeam, kickoffAt: new Date('2026-09-09T20:15:00Z'),
    result: {
      id: 'test-result', homeScore: awarded ? 3 : 1, awayScore: awarded ? 0 : 4,
      isDisputed: false, disputes: [],
      overturn: awarded ? { originalHomeScore: 1, originalAwayScore: 4, awardedHomeScore: 3, awardedAwayScore: 0,
        reasonCode: 'PLAYER_LIMIT', decidedAt: new Date('2026-09-12T12:00:00Z'),
        evidenceNote: 'SECRET_EVIDENCE', rulesBasis: 'SECRET_RULES' } : null,
      teamMetadata: [
        { teamId: homeId, goalsRecorded: 1, scorers: [{ name: 'Nomads scorer', goals: 1 }], playerOfMatchName: 'Test player' },
        { teamId: 'under', goalsRecorded: 4, scorers: [{ name: 'Under scorer', goals: 4 }], playerOfMatchName: 'Test player' },
      ],
    },
  };
  const queries = [];
  const stubs = {
    'next/link': { default: p => React.createElement('a', { href: p.href, className: p.className }, p.children), __esModule: true },
    'next/navigation': { notFound() { throw new Error('Unexpected not found'); } },
    '@/lib/requireCaptain': { async requireCaptain(id) { assert.equal(id, teamid); if (!allowed) throw new Error('Forbidden'); } },
    '@/lib/captain/related-teams': { async getCaptainRelatedTeamContext() { return { team: { id: teamid, name: 'Test team', league: null }, currentLeague: null, currentLeagueId: 'league', relatedTeamIds: [teamid, `${teamid}-past`] }; } },
    '@/lib/captain/onboarding': { async getCaptainOnboardingStatus() { return { isChecklistComplete: true }; } },
    '@/lib/payments/team-payment-ledger': { async getTeamPaymentLedger() { return { entries: [], openEntries: [] }; }, formatPaymentMoney: () => '£0.00' },
    '@/lib/leagueTable': { async getLeagueTable() { return []; } },
    '@/lib/standings': { async getLeagueStandings() { return { rows: [], hasDivisions: false, divisions: [] }; } },
    '@/lib/fixtures/storedAiPredictions': { async getStoredAiPreviewsByFixtureIds() { return prediction ? new Map([[fixture.id, { predictedHomeScore: prediction[0], predictedAwayScore: prediction[1] }]]) : new Map(); } },
    '@/lib/prisma': { prisma: {
      fixture: { async findMany(query) {
        queries.push(query);
        if (query.where.status === 'SCHEDULED') return [];
        const resultQuery = query.select?.result || query.include?.result;
        const summary = resultQuery?.select?.overturn?.select || resultQuery?.include?.overturn?.select;
        assert.ok(summary, `${kind} must select the public overturn summary`);
        assert.equal(summary.originalHomeScore, true); assert.equal(summary.awardedHomeScore, true);
        assert.equal(summary.reasonCode, true); assert.equal(summary.evidenceNote, undefined); assert.equal(summary.rulesBasis, undefined);
        const copy = structuredClone(fixture);
        if (copy.result.overturn) copy.result.overturn = Object.fromEntries(Object.keys(summary).map(key => [key, copy.result.overturn[key]]));
        if (kind === 'overview' && resultQuery.include) copy.result.teamMetadata = copy.result.teamMetadata.filter(row => row.teamId === (teamid === 'nomads' ? homeId : teamid));
        return [copy];
      } },
      resultDispute: { async count() { return 0; } },
    } },
  };
  for (const name of ['CaptainDashboardLeagueTable', 'CaptainOnboardingChecklist', 'CaptainVeoPriorityCard', 'CaptainTeamNudges']) stubs[`@/components/captain/${name}`] = noopComponent;
  stubs['@/components/leagues/DivisionAwareDashboardTables'] = noopComponent;
  const file = kind === 'overview' ? 'src/app/captain/team/[teamid]/page.tsx' : 'src/app/captain/team/[teamid]/results-history/page.tsx';
  const Page = load(file, stubs).default;
  const element = await Page({ params: Promise.resolve({ teamid }) });
  function findRow(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.['data-captain-result-outcome'] || (kind === 'history' && node.type === 'article')) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = findRow(child); if (found) return found; }
    return null;
  }
  const row = findRow(element);
  assert.ok(row, `${kind} row must be present`);
  return { html: renderToStaticMarkup(element), rowHtml: renderToStaticMarkup(row), queries };
}
module.exports = { renderCaptainView };
