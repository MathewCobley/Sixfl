const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(read(file), { fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const localRequire = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/')) {
        const base = `src/${id.slice(2)}`;
        return load([`${base}.ts`, `${base}.tsx`].find(p => fs.existsSync(path.join(root, p))));
      }
      return require(id);
    };
    new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}
const shared = loader()('src/lib/teams/move-confirmation.ts');
function harness(options = {}) {
  const writes = [], refreshes = [];
  const load = loader({
    '@/lib/requireAdmin': { requireAdmin: async () => {
      if (options.denied) throw new Error('ADMIN_REQUIRED');
      return { user: options.bypass ? null : { id: 'admin-one', name: 'Test admin', email: 'admin@example.test' } };
    } },
    '@/lib/prisma': { prisma: { team: { updateMany: async args => {
      writes.push(args); if (options.fail) throw new Error('Database unavailable');
      return { count: options.stale ? 0 : 1 };
    } } } },
    'next/cache': { revalidatePath: p => { refreshes.push(p); if (options.refreshFails) throw new Error('Refresh failed'); } },
  });
  return { ...load('src/app/(admin)/admin/teams/move-confirmation-actions.ts'), writes, refreshes };
}
const input = { teamId: 'team-one', status: 'CONFIRMED', previousStatus: 'PENDING' };

test('three distinct states never confuse no response with a refusal', () => {
  assert.deepEqual(shared.TEAM_MOVE_CONFIRMATION_OPTIONS.map(o => o.value), ['PENDING', 'CONFIRMED', 'DECLINED']);
  assert.equal(shared.teamMoveConfirmationLabel('CONFIRMED'), 'Confirmed — OK to move');
  for (const invalid of [null, undefined, '', 'yes', false, {}, 'MOVED']) assert.equal(shared.isTeamMoveConfirmationStatus(invalid), false);
});

test('only an authenticated administrator can save; the dev bypass cannot write', async () => {
  const denied = harness({ denied: true });
  await assert.rejects(denied.saveTeamMoveConfirmation(input), /ADMIN_REQUIRED/);
  assert.equal(denied.writes.length, 0);
  const bypass = harness({ bypass: true });
  assert.equal((await bypass.saveTeamMoveConfirmation(input)).ok, false);
  assert.equal(bypass.writes.length, 0);
});

test('malformed identifiers and statuses are rejected before any write', async () => {
  const h = harness();
  for (const value of [null, {}, { ...input, teamId: '' }, { ...input, teamId: 'x'.repeat(201) }, { ...input, status: 'MOVED' }, { ...input, previousStatus: 'anything' }]) {
    assert.equal((await h.saveTeamMoveConfirmation(value)).ok, false);
  }
  assert.equal(h.writes.length, 0);
});

test('all three responses target only the selected id and update no operational fields', async () => {
  for (const status of ['PENDING', 'CONFIRMED', 'DECLINED']) {
    const h = harness();
    const result = await h.saveTeamMoveConfirmation({ ...input, status });
    assert.equal(result.ok, true);
    assert.equal(result.status, status);
    assert.equal(result.updatedBy, 'Test admin');
    assert.deepEqual(h.writes[0].where, { id: 'team-one', moveConfirmationStatus: 'PENDING', league: { is: { isMoving: true } } });
    assert.deepEqual(Object.keys(h.writes[0].data).sort(), ['moveConfirmationStatus', 'moveConfirmationUpdatedAt', 'moveConfirmationUpdatedBy']);
    assert.deepEqual(h.refreshes, ['/admin/teams', '/admin/teams/team-one']);
  }
});

test('stale/deleted teams and failed writes do not report success', async () => {
  for (const option of [{ stale: true }, { fail: true }]) {
    const h = harness(option); const result = await h.saveTeamMoveConfirmation(input);
    assert.equal(result.ok, false); assert.equal(h.refreshes.length, 0);
  }
});

test('successful save is not undone or misreported when cache refresh fails', async () => {
  const h = harness({ refreshFails: true });
  assert.equal((await h.saveTeamMoveConfirmation(input)).ok, true);
  assert.equal(h.writes.length, 1);
});

test('native dropdown has the saved option, a team-specific accessible label and save feedback', () => {
  const load = loader({ '@/app/(admin)/admin/teams/move-confirmation-actions': { saveTeamMoveConfirmation: () => { throw new Error('SSR must not save'); } } });
  const Component = load('src/components/admin/teams/TeamMoveConfirmationSelect.tsx').default;
  for (const status of ['PENDING', 'CONFIRMED', 'DECLINED']) {
    const html = renderToStaticMarkup(React.createElement(Component, { enabled: true, teamId: 'team-one', teamName: 'Example FC', initialStatus: status }));
    assert.ok(html.includes('Move confirmation for Example FC'));
    assert.ok(html.includes(`value="${status}" selected=""`));
    assert.ok(html.includes('Saves automatically.'));
    assert.equal((html.match(/<option /g) || []).length, 3);
  }
});

test('both owning pages retain the tracker and original controls after production prebuild', () => {
  for (const file of ['src/app/(admin)/admin/teams/page.tsx', 'src/app/(admin)/admin/teams/[id]/page.tsx']) {
    const source = read(file);
    assert.ok(source.includes('<TeamMoveConfirmationSelect'));
    assert.ok(source.includes('teamId={team.id}'));
    assert.ok(source.includes('initialStatus={team.moveConfirmationStatus}'));
    assert.ok(source.includes('initialUpdatedAt={team.moveConfirmationUpdatedAt?.toISOString() ?? null}'));
  }
  assert.ok(read('src/app/(admin)/admin/teams/page.tsx').includes('moveConfirmationStatus: true'));
  assert.ok(read('src/app/(admin)/admin/teams/[id]/page.tsx').includes('action={updateTeamDetailsAction}'));
  const action = read('src/app/(admin)/admin/teams/move-confirmation-actions.ts');
  assert.equal(/queueNotification|sendEmail|fixture\.update|teamMember\.|paymentCharge\./.test(action), false);
  assert.ok(read('prisma/schema.prisma').includes('moveConfirmationStatus    TeamMoveConfirmationStatus @default(PENDING)'));
});

test('PostgreSQL migration is repeatable, defaults to pending and preserves a saved response and league', () => {
  const url = process.env.TEAM_MOVE_TEST_DATABASE_URL;
  assert.ok(url, 'Use the dedicated local test database; never a live database.');
  const parsed = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/sixfl_team_move_test');
  const sql = text => execFileSync('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1', '-Atc', text], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  sql('CREATE TABLE "Team" ("id" TEXT PRIMARY KEY, "leagueId" TEXT); INSERT INTO "Team" VALUES (\'one\',\'unchanged-league\'),(\'two\',\'other-league\');');
  const migration = read('prisma/migrations/20260906124500_team_move_confirmation/migration.sql');
  sql(migration);
  assert.equal(sql('SELECT "moveConfirmationStatus" FROM "Team" WHERE "id"=\'one\''), 'PENDING');
  sql('UPDATE "Team" SET "moveConfirmationStatus"=\'CONFIRMED\', "moveConfirmationUpdatedBy"=\'Test admin\', "moveConfirmationUpdatedAt"=NOW() WHERE "id"=\'one\';');
  sql(migration);
  assert.equal(sql('SELECT "moveConfirmationStatus"||\'|\'||"leagueId"||\'|\'||"moveConfirmationUpdatedBy" FROM "Team" WHERE "id"=\'one\''), 'CONFIRMED|unchanged-league|Test admin');
  assert.equal(sql('SELECT "moveConfirmationStatus" FROM "Team" WHERE "id"=\'two\''), 'PENDING');
  assert.throws(() => sql('UPDATE "Team" SET "moveConfirmationStatus"=\'INVALID\''));
  sql('UPDATE "Team" SET "moveConfirmationStatus"=\'DECLINED\' WHERE "id"=\'one\';');
  assert.equal(sql('SELECT "moveConfirmationStatus" FROM "Team" WHERE "id"=\'one\''), 'DECLINED');
  sql('UPDATE "Team" SET "moveConfirmationStatus"=\'PENDING\' WHERE "id"=\'one\';');
  assert.equal(sql('SELECT "moveConfirmationStatus" FROM "Team" WHERE "id"=\'one\''), 'PENDING');
});
