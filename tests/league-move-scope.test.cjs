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
const teamAction = 'src/app/(admin)/admin/teams/move-confirmation-actions.ts';
const leagueAction = 'src/app/(admin)/admin/leagues/actions.ts';
function loader(mocks) {
  const cache = new Map();
  return function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(read(file), { fileName: file, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const req = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/')) {
        const base = `src/${id.slice(2)}`;
        const resolved = [base + '.ts', base + '.tsx'].find(p => fs.existsSync(path.join(root, p)));
        if (!resolved) throw new Error(`Unknown test import ${id}`);
        return load(resolved);
      }
      return require(id);
    };
    new Function('require', 'module', 'exports', code)(req, module, module.exports);
    return module.exports;
  };
}
const admin = { requireAdmin: async () => ({ user: { id: 'scope-admin', name: 'Scope Admin' } }) };
const cache = { revalidatePath: () => {} };

test('disabled, unassigned and unspecified league gates render no dropdown or helper text', () => {
  const Control = loader({ '@/app/(admin)/admin/teams/move-confirmation-actions': {} })('src/components/admin/teams/TeamMoveConfirmationSelect.tsx').default;
  for (const enabled of [false, undefined, null]) {
    assert.equal(renderToStaticMarkup(React.createElement(Control, { enabled, teamId: 'cat', teamName: 'Catterick', initialStatus: 'CONFIRMED' })), '');
  }
  const html = renderToStaticMarkup(React.createElement(Control, { enabled: true, teamId: 'north', teamName: 'Northallerton', initialStatus: 'CONFIRMED' }));
  assert.ok(html.includes('Move confirmation for Northallerton'));
  assert.ok(html.includes('value="CONFIRMED" selected=""'));
});

test('all native owners use the saved league flag, never a name match or DOM bridge', () => {
  for (const file of ['src/app/(admin)/admin/teams/page.tsx', 'src/app/(admin)/admin/teams/[id]/page.tsx']) {
    const source = read(file);
    assert.ok(source.includes('enabled={team.league?.isMoving === true}'), file);
    assert.ok(source.includes('isMoving: true'), file);
    assert.ok(source.includes('initialStatus={team.moveConfirmationStatus}'));
  }
  const form = read('src/components/admin/leagues/LeagueForm.tsx');
  assert.ok(form.includes('name="isMoving" type="checkbox"'));
  assert.ok(form.includes('checked={isMoving}'));
  assert.ok(form.includes('League move'));
  assert.ok(form.includes('name="leagueMoveSettingPresent"'));
  assert.ok(read('src/app/(admin)/admin/leagues/[id]/page.tsx').includes('isMoving: league.isMoving'));
  assert.match(read('prisma/schema.prisma'), /isMoving\s+Boolean\s+@default\(false\)/);
  for (const file of [teamAction, leagueAction, 'src/components/admin/teams/TeamMoveConfirmationSelect.tsx', 'src/components/admin/leagues/LeagueForm.tsx']) {
    const source = read(file);
    assert.equal(/MutationObserver|document\.querySelector|\.innerHTML\s*=/.test(source), false, file);
    assert.equal(/Northallerton|Catterick/.test(source), false, file);
  }
});

test('league save persists both tick and untick, preserves old forms and refreshes both Teams screens', async () => {
  for (const choice of ['checked', 'unchecked', 'legacy']) {
    const writes = [], paths = [];
    const { updateLeagueAction } = loader({
      '@/lib/requireAdmin': admin,
      '@/lib/prisma': { prisma: { league: {
        findUnique: async () => ({ id: 'north', slug: 'north' }),
        findFirst: async () => null,
        update: async value => { writes.push(value); return {}; },
      }, $executeRaw: async () => 1 } },
      'next/cache': { revalidatePath: (...args) => paths.push(args) },
      'next/navigation': { redirect: () => { throw new Error('Unexpected redirect'); } },
      '@/lib/notifications/service': {}, '@/lib/notifications/team-contacts': {}, '@/lib/resend/client': {},
    })(leagueAction);
    const form = new FormData(); form.set('name', 'North'); form.set('slug', 'north');
    if (choice !== 'legacy') form.set('leagueMoveSettingPresent', '1');
    if (choice === 'checked') form.set('isMoving', 'true');
    const result = await updateLeagueAction('north', {}, form);
    assert.equal(result.success, true);
    assert.equal(writes[0].data.isMoving, choice === 'legacy' ? undefined : choice === 'checked');
    assert.deepEqual(writes[0].where, { id: 'north' });
    assert.ok(paths.some(args => args[0] === '/admin/teams'));
    assert.ok(paths.some(args => args[0] === '/admin/teams/[id]' && args[1] === 'page'));
    assert.equal(Object.hasOwn(writes[0].data, 'moveConfirmationStatus'), false);
  }
});

test('league edit cannot bypass administrator authorization or save invalid form data', async () => {
  let writes = 0;
  function build(auth) { return loader({
    '@/lib/requireAdmin': auth,
    '@/lib/prisma': { prisma: { league: { findUnique: async () => ({id:'north', slug:'north'}), update: async () => { writes++; } } } },
    'next/cache': cache, 'next/navigation': {}, '@/lib/notifications/service': {}, '@/lib/notifications/team-contacts': {}, '@/lib/resend/client': {},
  })(leagueAction); }
  await assert.rejects(build({requireAdmin: async () => { throw new Error('ADMIN_REQUIRED'); }}).updateLeagueAction('north', {}, new FormData()), /ADMIN_REQUIRED/);
  const result = await build(admin).updateLeagueAction('north', {}, new FormData());
  assert.ok(result.error); assert.equal(writes, 0);
});

test('PostgreSQL opt-in defaults, Northallerton-only rollout and real action enforce league scope', async () => {
  const url = process.env.TEAM_MOVE_TEST_DATABASE_URL;
  assert.ok(url, 'Dedicated local test database required');
  const parsed = new URL(url);
  assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/sixfl_team_move_test');
  const sql = text => execFileSync('psql', [url, '-X', '-v','ON_ERROR_STOP=1','-Atc',text], {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  sql(`CREATE TABLE "League" (id TEXT PRIMARY KEY, name TEXT, season TEXT);
    INSERT INTO "League" VALUES ('north','Northallerton Wednesday Mens','Summer 2026'),('cat','Catterick Monday Mens','Winter 2026'),('old','Northallerton Wednesday Mens','Summer 2025');
    ALTER TABLE "Team" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT NOW();
    INSERT INTO "Team" (id,"leagueId") VALUES ('scope-north','north'),('scope-cat','cat'),('scope-none',NULL);`);
  const migration = read('prisma/migrations/20260906142000_league_move_tracking/migration.sql');
  sql(migration);
  assert.equal(sql('SELECT id FROM "League" WHERE "isMoving"'), 'north');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const { saveTeamMoveConfirmation } = loader({ '@/lib/prisma': {prisma}, '@/lib/requireAdmin':admin, 'next/cache':cache })(teamAction);
    const save = (teamId, status='CONFIRMED', previousStatus='PENDING') => saveTeamMoveConfirmation({teamId,status,previousStatus});
    assert.equal((await save('scope-north')).ok, true);
    assert.equal((await save('scope-cat')).ok, false);
    assert.equal((await save('scope-none')).ok, false);
    sql('UPDATE "League" SET "isMoving"=false WHERE id=\'north\'');
    assert.equal((await save('scope-north','DECLINED','CONFIRMED')).ok, false);
    assert.equal(sql('SELECT "moveConfirmationStatus" FROM "Team" WHERE id=\'scope-north\''), 'CONFIRMED');
    sql(migration);
    assert.equal(sql('SELECT count(*) FROM "League" WHERE "isMoving"'), '0');
    sql('UPDATE "League" SET "isMoving"=true WHERE id=\'cat\'');
    assert.equal((await save('scope-cat')).ok, true);
    // A team moved to an unchecked league cannot use an old enabled dropdown.
    sql('UPDATE "Team" SET "leagueId"=\'old\' WHERE id=\'scope-cat\'');
    assert.equal((await save('scope-cat','DECLINED','CONFIRMED')).ok, false);
    sql('UPDATE "League" SET "isMoving"=true WHERE id=\'north\'');
    assert.equal((await save('scope-north','DECLINED','CONFIRMED')).ok, true);
    sql('INSERT INTO "League" (id,name,season) VALUES (\'new\',\'New league\',\'Winter\')');
    assert.equal(sql('SELECT "isMoving" FROM "League" WHERE id=\'new\''), 'f');
  } finally { await prisma.$disconnect(); }
});
