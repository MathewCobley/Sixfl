const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = path.resolve('scripts/apply-fixture-team-fee-overrides.cjs');
const division = path.resolve('src/app/(admin)/admin/fixtures/generate/division-actions.ts');

// Exercise the real preparation script with an in-memory filesystem. No files
// or databases are modified, and unknown source must still fail closed.
function run(files) {
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    __dirname: path.dirname(script), console: { log() {} },
    require(name) {
      if (name === 'node:path') return path;
      if (name === 'node:fs') return {
        readFileSync(file) { return files.get(file) ?? fs.readFileSync(file, 'utf8'); },
        writeFileSync(file, content) { files.set(file, content); },
      };
      throw new Error(`Unexpected preparation dependency ${name}`);
    },
  }, { filename: script });
}

test('native division fields and later double-points properties survive preparation unchanged', () => {
  const original = fs.readFileSync(division, 'utf8');
  assert.match(original, /awayMatchFeePence: number;\s+doublePoints:/);
  const files = new Map([[division, original]]);
  run(files);
  assert.equal(files.get(division), original);
  const first = [...files];
  run(files);
  assert.deepEqual([...files], first, 'idempotent preparation');
});

test('legacy fee fields are upgraded without dropping trailing properties', () => {
  const legacy = fs.readFileSync(division, 'utf8')
    .replace(/    homeMatchFeePence: number;\n    awayMatchFeePence: number;\n/, '')
    .replace(/          homeMatchFeePence: homeTeam.standardMatchFeePence \?\? 4000,\n          awayMatchFeePence: awayTeam.standardMatchFeePence \?\? 4000,\n/, '')
    .replace(/          homeMatchFeePence: fixtureData.homeMatchFeePence,\n          awayMatchFeePence: fixtureData.awayMatchFeePence,\n/, '');
  const files = new Map([[division, legacy]]);
  run(files);
  assert.match(files.get(division), /homeMatchFeePence: number;/);
  assert.match(files.get(division), /homeMatchFeePence: homeTeam.standardMatchFeePence \?\? 4000/);
  assert.match(files.get(division), /awayMatchFeePence: fixtureData.awayMatchFeePence,\s+doublePoints: fixtureData.doublePoints/);
});
