const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');

function loadPriorityHistory() {
  const file = path.join(root, 'src/lib/sixfl-tv/priority-history.ts');
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  new Function('require','module','exports',code)((id) => {
    if (id === 'node:crypto') return require(id);
    if (id === '@prisma/client') return { Prisma: { sql: () => ({}) } };
    if (id === '@/lib/prisma') return { prisma: {} };
    if (id === '@/lib/sixfl-tv/priority-score') return { getSixflTvPriorityScores: async () => new Map() };
    if (id === '@/lib/veo/service') return { readVeoTeams: async () => [] };
    if (id === '@/lib/datetime/london') return {
      toLondonDateInputValue(value) {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/London',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(value).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
        return `${parts.year}-${parts.month}-${parts.day}`;
      },
    };
    throw new Error('Unexpected dependency '+id);
  }, module, module.exports);
  return module.exports;
}

test('Priority history uses stable Monday-start UK weeks across DST', () => {
  const history = loadPriorityHistory();
  assert.equal(history.priorityWeekStart(new Date('2026-09-19T12:00:00Z')), '2026-09-14');
  assert.equal(history.priorityWeekStart(new Date('2026-09-21T00:05:00Z')), '2026-09-21');
  assert.equal(history.priorityWeekStart(new Date('2026-10-26T00:05:00Z')), '2026-10-26');
});

test('Priority history is permanent, weekly and visible by league', () => {
  const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260919003000_sixfl_tv_priority_weekly_history/migration.sql'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src/lib/sixfl-tv/priority-history.ts'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'src/app/(admin)/admin/sixfl-tv/priority/page.tsx'), 'utf8');
  const chart = fs.readFileSync(path.join(root, 'src/components/admin/sixfl-tv/PriorityLeagueChart.tsx'), 'utf8');
  const layout = fs.readFileSync(path.join(root, 'src/app/(admin)/admin/sixfl-tv/layout.tsx'), 'utf8');
  const cron = fs.readFileSync(path.join(root, 'src/app/api/cron/notifications/route.ts'), 'utf8');

  assert.match(migration, /SixflTvPriorityWeeklySnapshot/);
  assert.match(migration, /UNIQUE INDEX[\s\S]*"weekStart","leagueId","teamId"/);
  assert.doesNotMatch(migration, /ON DELETE CASCADE/);
  assert.match(source, /ON CONFLICT \("weekStart","leagueId","teamId"\) DO NOTHING/);
  assert.match(source, /leagueName/);
  assert.match(source, /teamName/);
  assert.match(cron, /sixfl-tv-priority-weekly-snapshot/);
  assert.match(cron, /capturePriorityWeeklySnapshot/);
  assert.match(layout, /\/admin\/sixfl-tv\/priority/);
  assert.match(page, /Permanent weekly history/);
  assert.match(page, /last five completed matches/);
  assert.match(page, /league\.currentAverage\.toFixed\(1\)/);
  assert.match(page, /points vs previous week/);
  assert.match(page, /Provisional team scores are included in the average/);
  assert.match(chart, /League average/);
  assert.match(chart, /\[0, 20, 40, 60, 80, 100\]/);
  assert.match(chart, /splitSegments/);
});
