const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const divisionPath = 'src/app/(admin)/admin/fixtures/generate/division-actions.ts';
const division = path.resolve(divisionPath);
const feeScript = path.resolve('scripts/apply-fixture-team-fee-overrides.cjs');
const tvScript = path.resolve('scripts/apply-sixfl-tv-fixture-badges.cjs');

// Extract the actual target calls and their unchanged helper definitions. The
// full production chain is tested separately by npm run prebuild: replaying an
// early schema patch after later Prisma formatting is not that lifecycle.
function runTarget(script, target, files, expectedCalls) {
  const text = fs.readFileSync(script, 'utf8');
  const source = ts.createSourceFile(script, text, ts.ScriptTarget.Latest, true);
  const calls = source.statements.filter((node) =>
    ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
    ['replaceOnce', 'replaceAllExact', 'patch'].includes(node.expression.expression.getText(source)));
  const selected = calls.filter((node) => node.expression.arguments[0]?.text === target);
  assert.equal(selected.length, expectedCalls, 'all expected target calls must be exercised');
  const code = text.slice(0, calls[0].getStart(source)) + selected.map((node) => node.getText(source)).join('\n');
  vm.runInNewContext(code, {
    __dirname: path.dirname(script), console: { log() {} },
    require(name) {
      if (name === 'node:path') return path;
      if (name === 'node:fs') return {
        readFileSync(file) {
          assert.ok(files.has(file), `unexpected read: ${file}`);
          return files.get(file);
        },
        writeFileSync(file, content) { files.set(file, content); },
      };
      throw new Error(`Unexpected preparation dependency ${name}`);
    },
  }, { filename: script });
}
const run = (files) => runTarget(feeScript, divisionPath, files, 4);

test('native division fields and double-points properties survive preparation unchanged', () => {
  const original = fs.readFileSync(division, 'utf8');
  assert.match(original, /awayMatchFeePence: number;\s+doublePoints:/);
  const files = new Map([[division, original]]);
  run(files);
  assert.equal(files.get(division), original);
  run(files);
  assert.equal(files.get(division), original, 'idempotent native preparation');
});

test('legacy fee fields are upgraded without dropping trailing properties', () => {
  const original = fs.readFileSync(division, 'utf8');
  const legacy = original
    .replace(/    homeMatchFeePence: number;\n    awayMatchFeePence: number;\n/, '')
    .replace(/          homeMatchFeePence: homeTeam.standardMatchFeePence \?\? 4000,\n          awayMatchFeePence: awayTeam.standardMatchFeePence \?\? 4000,\n/, '')
    .replace(/          homeMatchFeePence: fixtureData.homeMatchFeePence,\n          awayMatchFeePence: fixtureData.awayMatchFeePence,\n/, '');
  assert.notEqual(legacy, original);
  const files = new Map([[division, legacy]]);
  run(files);
  assert.equal(files.get(division), original);
  run(files);
  assert.equal(files.get(division), original);
});

test('unknown division source still fails closed', () => {
  assert.throws(() => run(new Map([[division, 'unrecognised source']])), /Expected fixture fee source/);
});

test('TV schema fields preserve both legacy round and native doublePoints properties', () => {
  for (const next of ['round Int?', 'doublePoints Boolean @default(false)\n  round Int?']) {
    const file = path.resolve('prisma/schema.prisma');
    const original = `model Fixture {\n  awayMatchFeePence   Int?\n\n  ${next}\n}`;
    const files = new Map([[file, original]]);
    runTarget(tvScript, 'prisma/schema.prisma', files, 1);
    const once = files.get(file);
    assert.match(once, /sixflTvRecorded\s+Boolean @default\(false\)/);
    assert.match(once, /sixflTvUrl\s+String\?/);
    assert.ok(once.endsWith(`\n\n  ${next}\n}`));
    runTarget(tvScript, 'prisma/schema.prisma', files, 1);
    assert.equal(files.get(file), once);
  }
});
