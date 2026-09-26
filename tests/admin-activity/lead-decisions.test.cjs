const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadSource, at } = require('./load.cjs');

const source = 'src/lib/admin/lead-decision-activity.ts';
const readOnly = { '@/lib/prisma': { prisma: {} } };
const { presentLeadDecisionActivity, getAdminLeadDecisionActivity } = loadSource(source, readOnly);
const playerEvidence = 'Contact chose individual-player interest instead of entering a team via their secure decision link.';
const row = (outcome = 'TEAM', extra = {}) => ({
  id: 'decision-1', leadId: 'lead-1', contactName: 'Alex Example', teamName: 'Example Rovers',
  area: 'Richmond', leagueName: 'Catterick Monday Mens', season: 'Winter 2026',
  outcome, occurredAt: at(), ...extra,
});

test('all three lead decisions have clear labels, league context and an exact lead link', () => {
  const items = presentLeadDecisionActivity(['TEAM', 'PLAYER', 'DECLINED'].map((kind, index) => row(kind, { id: `d-${index}` })));
  assert.equal(items.length, 3);
  assert.match(items[0].title, /Team entry confirmed/);
  assert.match(items[0].detail, /Example Rovers/);
  assert.match(items[1].title, /chose to join as an individual player/);
  assert.match(items[1].detail, /no team place assigned/);
  assert.match(items[2].title, /No longer interested/);
  assert.match(items[2].detail, /chasing stopped/);
  for (const item of items) {
    assert.equal(item.kind, 'LEAD');
    assert.match(item.title, /Alex Example/);
    assert.match(item.detail, /Catterick Monday Mens · Winter 2026/);
    assert.equal(item.href, '/admin/leads/lead-1');
    assert.equal(item.occurredAt.getTime(), at().getTime());
  }
});

test('stable decision IDs deduplicate reads without substituting new activity times', () => {
  const input = row('TEAM', { updatedAt: at(50), sentAt: at(45) });
  const once = presentLeadDecisionActivity([input, input]);
  assert.equal(once.length, 1);
  assert.deepEqual(presentLeadDecisionActivity([input]), once);
  assert.equal(once[0].occurredAt.getTime(), at().getTime());
  assert.equal(presentLeadDecisionActivity([row('TEAM', { occurredAt: null })]).length, 0);
  assert.equal(presentLeadDecisionActivity([row('TEAM', { occurredAt: new Date('invalid') })]).length, 0);
  assert.equal(presentLeadDecisionActivity([row('PENDING')]).length, 0);
});

test('missing league, missing team name and encoded lead IDs remain usable', () => {
  const [item] = presentLeadDecisionActivity([row('TEAM', { leadId: 'lead /?#', leagueName: null, season: null, teamName: '', contactName: '' })]);
  assert.equal(item.href, '/admin/leads/lead%20%2F%3F%23');
  assert.match(item.detail, /Richmond · Team name not decided yet/);
  assert.match(item.title, /Unnamed lead/);
});

test('reader is bounded and read-only, with no fallback to status or update timestamps', async () => {
  let query;
  const result = await getAdminLeadDecisionActivity(5000, { $queryRaw: async sql => { query = sql; return [row()]; } });
  assert.equal(result.length, 1);
  assert.equal(query.values.at(-1), 100);
  assert.ok(query.values.includes(playerEvidence));
  assert.match(query.sql, /JOIN "InterestLead" lead ON lead\."id" = decision\."leadId"/);
  assert.doesNotMatch(query.sql, /"updatedAt"|"sentAt"|QUALIFIED|INSERT|UPDATE|DELETE/);
  const content = fs.readFileSync(source, 'utf8');
  assert.doesNotMatch(content, /queueNotification|queueDirectNotification|sendEmail|\.update\(|\.create\(/);
  assert.ok(fs.readFileSync('src/lib/leads/team-lead-player-choice.ts', 'utf8').includes(playerEvidence), 'existing response evidence must not silently drift');
});

test('shared feed includes replies to old leads independently of the new-lead window', async () => {
  const decisions = [row('TEAM', { id: 'old-lead-response', occurredAt: at(58) }), row('PLAYER', { id: 'player-response', leadId: 'player-lead', occurredAt: at(57) })];
  const payments = Array.from({ length: 50 }, (_, i) => ({ id: `payment:${i}`, kind: 'TEAM_PAYMENT', title: 'Recorded payment', detail: '', href: '/admin/payments', occurredAt: at(i) }));
  const empty = { findMany: async () => [] };
  const prisma = {
    portalMessage: empty, messageEntry: empty, interestLead: empty,
    fixtureCaptainConfirmation: empty, matchResult: empty, resultDispute: empty,
    $queryRaw: async sql => sql.sql.includes('FROM "LeadTeamConfirmation"') ? decisions : [],
  };
  const { getAdminLatestActivity } = loadSource('src/lib/admin/latest-activity.ts', {
    '@/lib/prisma': { prisma }, './payment-activity': { getAdminPaymentActivity: async () => payments },
  });
  const items = await getAdminLatestActivity(50);
  assert.equal(items.length, 50);
  assert.equal(items[0].id, 'lead-decision:old-lead-response:TEAM');
  assert.equal(items[1].id, 'lead-decision:player-response:PLAYER');
  assert.equal(items[2].id, 'payment:49');
  assert.equal(items.filter(item => item.kind === 'TEAM_PAYMENT').length, 48);
  assert.equal(new Set(items.map(item => item.id)).size, 50);
  assert.deepEqual(await getAdminLatestActivity(50), items, 'refreshing does not manufacture a new response');
});

test('owning dashboard component renders the real decision title and direct link', () => {
  const Link = ({ children, ...props }) => React.createElement('a', props, children);
  const { default: Activity } = loadSource('src/components/admin/AdminLatestActivity.tsx', { 'next/link': Link });
  const items = presentLeadDecisionActivity([row()]).map(item => ({
    ...item, kindLabel: 'Lead', tone: '', occurredAt: item.occurredAt.toISOString(),
    occurredAtLabel: '24 Sept, 12:00', relativeLabel: 'Just now',
  }));
  const html = renderToStaticMarkup(React.createElement(Activity, { items }));
  assert.match(html, /href="\/admin\/leads\/lead-1"/);
  assert.match(html, /Team entry confirmed/);
  assert.match(html, /Catterick Monday Mens/);
  assert.match(html, /data-activity-id="lead-decision:decision-1:TEAM"/);
});

test('real PostgreSQL selects only saved decisions, never pending/Qualified/page-view events', {
  skip: !process.env.ACTIVITY_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.ACTIVITY_TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/activity_test');
  const { Prisma, PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  // Read-only CTEs shadow the production tables; this never creates a test lead,
  // runs a migration, changes a decision or contacts a messaging provider.
  const definitions = [
    ['team', 'TEAM', 'QUALIFIED', 'CONFIRMED', at(1), null, '', 'catterick'],
    ['player', 'PLAYER', 'NEW', 'DECLINED', null, at(2), playerEvidence, 'catterick'],
    ['declined', 'TEAM', 'CLOSED', 'DECLINED', null, at(3), 'Recorded by Administrator', 'catterick'],
    ['pending', 'TEAM', 'CONTACTED', 'PENDING', null, null, '', 'catterick'],
    ['qualified-only', 'TEAM', 'QUALIFIED', 'PENDING', null, null, '', 'catterick'],
    ['no-confirm-time', 'TEAM', 'QUALIFIED', 'CONFIRMED', null, null, '', 'catterick'],
    ['no-decline-time', 'TEAM', 'CLOSED', 'DECLINED', null, null, '', 'catterick'],
    ['manual-player-change', 'PLAYER', 'NEW', 'DECLINED', null, at(55), '', 'catterick'],
    ['referee', 'REFEREE', 'NEW', 'DECLINED', null, at(56), '', 'catterick'],
    ['no-league', 'TEAM', 'QUALIFIED', 'CONFIRMED', at(0), null, '', null],
  ];
  const leadRows = definitions.map(([id, type, status, , , , note, league]) => Prisma.sql`(${id}::text, ${id}::text, 'Example Rovers'::text, 'Richmond'::text, ${league}::text, ${type}::text, ${note}::text, ${status}::text)`);
  // A new email sentAt/updatedAt deliberately lies after ALL genuine responses.
  const decisionRows = definitions.map(([id, , , status, confirmedAt, declinedAt]) => Prisma.sql`(${`d-${id}`}::text, ${id}::text, ${status}::text, ${confirmedAt}::timestamp, ${declinedAt}::timestamp, ${at(59)}::timestamp, ${at(59)}::timestamp)`);
  const run = limit => getAdminLeadDecisionActivity(limit, { $queryRaw: sql => db.$queryRaw(Prisma.sql`
    WITH "League" ("id", "name", "season") AS (VALUES ('catterick', 'Catterick Monday Mens', 'Winter 2026')),
      "InterestLead" ("id", "contactName", "teamName", "area", "leagueId", "interestType", "message", "status") AS (VALUES ${Prisma.join(leadRows)}),
      "LeadTeamConfirmation" ("id", "leadId", "status", "confirmedAt", "declinedAt", "sentAt", "updatedAt") AS (VALUES ${Prisma.join(decisionRows)})
    ${sql}
  `) });
  try {
    const items = await run(100);
    assert.deepEqual(items.map(item => item.id), ['lead-decision:d-declined:DECLINED', 'lead-decision:d-player:PLAYER', 'lead-decision:d-team:TEAM', 'lead-decision:d-no-league:TEAM']);
    assert.deepEqual(items.map(item => item.occurredAt.getTime()), [at(3), at(2), at(1), at(0)].map(date => date.getTime()));
    assert.match(items[1].title, /individual player/);
    assert.doesNotMatch(items[1].title, /No longer interested/);
    assert.deepEqual(await run(100), items);
    assert.deepEqual(await run(2), items.slice(0, 2));
  } finally { await db.$disconnect(); }
});
