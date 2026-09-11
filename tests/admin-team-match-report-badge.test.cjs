const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Prisma, PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const serviceFile = 'src/lib/admin/team-match-report-activity.ts';
const badgeFile = 'src/components/admin/teams/TeamMatchReportBadge.tsx';
const owners = ['src/app/(admin)/admin/teams/page.tsx', 'src/app/(admin)/admin/teams/[id]/page.tsx'];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process: { env: { NODE_ENV: 'production' } }, console: { warn() {} }, require(id) {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (['@prisma/client', '@heroicons/react/24/outline', 'react/jsx-runtime'].includes(id)) return require(id);
    throw new Error(`Unmocked I/O dependency: ${id}`);
  } }, { filename: file });
  return module.exports;
}
const Badge = load(badgeFile).default;
const renderBadge = activity => renderToStaticMarkup(React.createElement(Badge, { activity }));
function service(db, authorise = async () => {}) {
  return load(serviceFile, { '@/lib/prisma': { prisma: db }, '@/lib/requireAdmin': { requireAdmin: authorise } }).getAdminTeamMatchReportActivity;
}

test('activity query is batched, parameterised, read-only and authorises before database access', async () => {
  const calls = [], order = [];
  const id = "team'); DROP TABLE ignored; --";
  const get = service({ $queryRaw: async query => {
    order.push('read'); calls.push(query);
    return [{ teamId: id, reportCount: 2, latestMatchAt: new Date('2020-09-09T23:30:00Z') }];
  } }, async () => { order.push('auth'); });
  const activity = await get([id, id, '']);
  assert.deepEqual(order, ['auth', 'read']);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].values.includes(id));
  assert.ok(!calls[0].text.includes(id));
  assert.equal(activity.get(id).reportCount, 2);
  assert.equal(activity.get(id).latestMatchAt, '2020-09-09T23:30:00.000Z');
  assert.doesNotMatch(calls[0].text, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b/);
  assert.doesNotMatch(calls[0].text, /MatchweekReport|Payment|Notification|email|phone/i);
});

test('empty teams make no query; denied access is not swallowed as unavailable', async () => {
  let queries = 0;
  const db = { $queryRaw: async () => { queries++; return []; } };
  assert.equal((await service(db)([])).size, 0);
  await assert.rejects(service(db, async () => { throw new Error('ADMIN_REQUIRED'); })(['a']), /ADMIN_REQUIRED/);
  assert.equal(queries, 0);
});

test('database errors leave team administration usable with an explicit unknown indicator', async () => {
  const activity = await service({ $queryRaw: async () => { throw new Error('unavailable'); } })(['a', 'b']);
  assert.equal(activity.get('a'), null);
  assert.match(renderBadge(activity.get('a')), /Reports unavailable/);
  assert.match(renderBadge(activity.get('b')), /Refresh to try again/);
});

test('no reports is unbadged; real reports have a small accessible, touch-expandable count and latest date', () => {
  assert.equal(renderBadge(undefined), '');
  assert.equal(renderBadge({ reportCount: 0 }), '');
  const html = renderBadge({ reportCount: 2, latestMatchAt: '2020-09-09T23:30:00.000Z' });
  assert.match(html, /<details[^>]*data-team-match-report-badge/);
  assert.match(html, /<summary/);
  assert.match(html, /Match reports · 2/);
  assert.match(html, /2 completed matches/);
  assert.match(html, /10 Sept 2020/);
  assert.match(html, /Scorers, assists, Player of the Match or ratings/);
  assert.match(html, /not confirmation that the latest report is complete/);
  assert.match(html, /entered on the team/);
  assert.match(renderBadge({ reportCount: 1, latestMatchAt: '2020-09-09T18:00:00.000Z' }), /1 completed match\./);
});

test('both admin team-name owners use the same service and badge; the captain save invalidates both', () => {
  for (const file of owners) {
    const source = read(file);
    assert.match(source, /import TeamMatchReportBadge from/);
    assert.match(source, /import \{ getAdminTeamMatchReportActivity \} from/);
    assert.match(source, /<TeamMatchReportBadge activity=\{matchReportActivity\.get\(team\.id\)\}/);
    assert.ok(source.indexOf('await requireAdmin()') < source.indexOf('await getAdminTeamMatchReportActivity('));
  }
  const save = read('src/app/captain/team/[teamid]/results/page.tsx').split('async function saveTeamMatchDetails')[1].split('async function createResultDispute')[0];
  assert.match(save, /await requireCaptain\(teamid\)/);
  assert.match(save, /prisma\.matchResultTeamMeta\.upsert/);
  assert.match(save, /replaceMatchPerformances/);
  assert.match(save, /revalidatePath\("\/admin\/teams"\)/);
  assert.ok(save.includes('revalidatePath(`/admin/teams/${teamid}`)'));
  assert.ok(read(owners[0]).includes('href="/admin/teams/logos"'));
  assert.ok(read(owners[0]).includes('<TeamMoveConfirmationSelect'));
  assert.ok(read(owners[1]).includes('<TeamMoveConfirmationSelect'));
  const occurrences = [];
  function scan(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) scan(file);
      else if (/\.[jt]sx?$/.test(file) && read(file).includes('import TeamMatchReportBadge')) occurrences.push(file);
    }
  }
  scan('src');
  assert.deepEqual(occurrences.sort(), [...owners].sort(), 'badge must remain private; no public/player/captain placement');
});

test('real admin list and team header show only the correct team badge and retain existing controls', async () => {
  const using = { id: 'using', name: 'Test United', claimCode: 'test-a', createdAt: new Date('2020-01-01'), teamMode: 'STANDARD', members: [], contactEmail: 'one@example.test', league: null, latestKickoffTime: '20:00' };
  const unused = { ...using, id: 'unused', claimCode: 'test-b', name: 'Test United', contactEmail: 'two@example.test' };
  let denied = false, reads = 0;
  const authorise = async () => { if (denied) throw new Error('ADMIN_REQUIRED'); };
  const db = {
    team: { findMany: async () => { reads++; return [using, unused]; }, findUnique: async () => { reads++; return using; } },
    league: { findMany: async () => [] }, emailTemplate: { findMany: async () => [] },
    notificationDispatch: { findMany: async () => [] }, messageThread: { findMany: async () => [] },
    $queryRaw: async query => { reads++; return query.text.includes('reported_matches') ? [{ teamId: 'using', reportCount: 3, latestMatchAt: new Date('2020-09-09T18:00:00Z') }] : []; },
  };
  const noop = () => {};
  const mocks = {
    '@/lib/prisma': { prisma: db }, '@/lib/requireAdmin': { requireAdmin: authorise },
    '@/lib/admin/team-match-report-activity': { getAdminTeamMatchReportActivity: service(db, authorise) },
    '@/lib/kits/constants': { TEAM_KIT_QUANTITY: 7 },
    '@/lib/teams/fixture-placeholders': { getFixturePlaceholderTeamIds: async () => new Set() },
    '@/lib/email/template-cta': { REFERRAL_PAGE_CTA_KEY: 'referralPageUrl', REFERRAL_PAGE_URL: '/refer' },
    '@/lib/notifications/team-contacts': { upsertTeamNotificationRecipient: async () => ({ snapshot: { primaryContact: {}, contacts: [], teamName: 'Test United' }, recipient: { id: 'test-recipient' } }) },
    '@/lib/payments/fixture-match-fees': { buildChargePaymentUrl: () => '/pay' },
    '@/lib/datetime/london': { formatDateTimeInLondon: date => date.toISOString() },
    'next/navigation': { notFound: () => { throw new Error('404'); } },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    './actions': { deleteTeamAction: noop },
    '../actions': { deleteTeamAction: noop, regenerateClaimCodeAction: noop, sendTeamMessageAction: noop, sendTeamPaymentRequestAction: noop, updateTeamDetailsAction: noop },
  };
  for (const file of owners) {
    for (const [, name] of read(file).matchAll(/from ["'](@\/components\/[^"']+)["']/g)) {
      mocks[name] = { __esModule: true, default: () => null };
    }
  }
  mocks['@/components/admin/teams/TeamMatchReportBadge'] = { __esModule: true, default: Badge };
  for (const [index, file] of owners.entries()) {
    const Page = load(file, mocks).default;
    const props = { params: Promise.resolve({ id: 'using' }) };
    const html = renderToStaticMarkup(await Page(props));
    assert.equal((html.match(/data-team-match-report-badge/g) || []).length, 1);
    assert.match(html, /Match reports · 3/);
    assert.match(html, /Test United/);
    if (index === 0) {
      assert.match(html, /href="\/admin\/teams\/using"/);
      assert.match(html, /href="\/admin\/teams\/unused"/);
      assert.match(html, /Download team logos/);
    } else assert.match(html, /Back to teams/);
    if (process.env.REPORT_BADGE_RENDER_DIR) {
      fs.mkdirSync(process.env.REPORT_BADGE_RENDER_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.REPORT_BADGE_RENDER_DIR, index === 0 ? 'list.html' : 'detail.html'), html);
    }
    denied = true; const priorReads = reads;
    await assert.rejects(Page(props), /ADMIN_REQUIRED/);
    assert.equal(reads, priorReads);
    denied = false;
  }
});

const testDb = process.env.REPORT_BADGE_TEST_DATABASE_URL;
test('real PostgreSQL counts substantive details once per exact team/match and excludes empty or automatic records', { skip: !testDb }, async () => {
  const url = new URL(testDb);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/sixfl_report_badge_test', 'Disposable localhost database only');
  const db = new PrismaClient({ datasourceUrl: testDb });
  try {
    await db.$transaction(async tx => {
      // Minimal test-only temporary tables mirror only the read columns; no production migrations or writes.
      for (const statement of [
        'CREATE TEMP TABLE "Fixture" (id TEXT PRIMARY KEY, "homeTeamId" TEXT, "awayTeamId" TEXT, status TEXT, "kickoffAt" TIMESTAMP) ON COMMIT DROP',
        'CREATE TEMP TABLE "MatchResult" (id TEXT PRIMARY KEY, "fixtureId" TEXT) ON COMMIT DROP',
        'CREATE TEMP TABLE "MatchResultTeamMeta" ("teamId" TEXT, "matchResultId" TEXT, "scorers" JSONB, "playerOfMatchName" TEXT) ON COMMIT DROP',
        'CREATE TEMP TABLE "PlayerMatchPerformance" ("teamId" TEXT, "matchResultId" TEXT, source TEXT, rating FLOAT) ON COMMIT DROP',
      ]) await tx.$executeRawUnsafe(statement);
      const addFixture = async (id, team, status = 'COMPLETED', when = '2020-09-09T18:00:00Z') => {
        await tx.$executeRaw`INSERT INTO "Fixture" VALUES (${id}, ${team}, ${'opponent'}, ${status}, ${new Date(when)})`;
        await tx.$executeRaw`INSERT INTO "MatchResult" VALUES (${id}, ${id})`;
      };
      const meta = async (team, fixture, scorers, potm = null) => tx.$executeRaw`INSERT INTO "MatchResultTeamMeta" VALUES (${team}, ${fixture}, ${JSON.stringify(scorers)}::jsonb, ${potm})`;
      const perf = async (team, fixture, source, rating) => tx.$executeRaw`INSERT INTO "PlayerMatchPerformance" VALUES (${team}, ${fixture}, ${source}, ${rating})`;
      await addFixture('m1', 'using'); await meta('using', 'm1', [], 'Test Player');
      await meta('opponent', 'm1', [{ name: 'Opponent Player', goals: 1 }]);
      await addFixture('m2', 'using', 'COMPLETED', '2020-09-10T18:00:00Z');
      await meta('using', 'm2', [{ name: 'Test Player', goals: 2, assists: 1 }]);
      await perf('using', 'm2', 'CAPTAIN_RECORDED', 8); await perf('using', 'm2', 'CAPTAIN_RECORDED', 9);
      await addFixture('m3', 'assists'); await meta('assists', 'm3', [{ name: 'Test Player', goals: 0, assists: 1 }]);
      await addFixture('m4', 'ratings'); await meta('ratings', 'm4', []); await perf('ratings', 'm4', 'CAPTAIN_RECORDED', 7);
      await addFixture('m5', 'empty');
      for (const data of [null, {}, 'broken', 1, [], [{ name: 'Player', goals: 0, assists: 0 }], [{ name: '', goals: 1 }], [{ name: 'Player', goals: -1 }]]) await meta('empty', 'm5', data, ' ');
      await addFixture('m6', 'automatic'); await perf('automatic', 'm6', 'SQUAD_SELECTION', 8);
      await addFixture('m7', 'score-only');
      await addFixture('m8', 'scheduled', 'SCHEDULED'); await meta('scheduled', 'm8', [], 'Player');
      await addFixture('m9', 'future', 'COMPLETED', '9999-09-09T18:00:00Z'); await meta('future', 'm9', [], 'Player');
      await meta('wrong-team', 'm1', [], 'Player');
      const ids = ['using', 'assists', 'ratings', 'empty', 'automatic', 'score-only', 'scheduled', 'future', 'wrong-team', 'same-name-other-id', 'opponent'];
      const activity = await service(tx)(ids);
      assert.equal(activity.get('using').reportCount, 2, 'multiple stats/players do not multiply match count');
      assert.equal(activity.get('using').latestMatchAt, '2020-09-10T18:00:00.000Z');
      for (const id of ['assists', 'ratings', 'opponent']) assert.equal(activity.get(id).reportCount, 1);
      for (const id of ids.filter(id => !['using', 'assists', 'ratings', 'opponent'].includes(id))) assert.equal(activity.has(id), false, id);
      assert.equal((await service(tx)(['ratings'])).size, 1, 'batch cannot leak activity for unrequested teams');
      await tx.$executeRaw`UPDATE "MatchResultTeamMeta" SET "playerOfMatchName" = ${'Changed Player'} WHERE "teamId" = ${'using'} AND "matchResultId" = ${'m1'}`;
      assert.equal((await service(tx)(['using'])).get('using').reportCount, 2, 'resaving is not a new report');
      await tx.$executeRaw`UPDATE "MatchResultTeamMeta" SET "playerOfMatchName" = NULL, "scorers" = '[]'::jsonb WHERE "teamId" = ${'using'} AND "matchResultId" = ${'m1'}`;
      assert.equal((await service(tx)(['using'])).get('using').reportCount, 1, 'cleared reports no longer imply recorded details');
    }, { timeout: 15000 });
  } finally { await db.$disconnect(); }
});
