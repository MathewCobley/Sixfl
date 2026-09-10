import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkFunctionBundles, inspectFunction, FUNCTION_BUDGET_BYTES } from '../scripts/check-vercel-function-bundles.mjs';

function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sixfl-bundle-'));
  try {
    for (const route of ['api/admin/teams/logo-export', 'admin/teams/logos']) {
      const directory = path.join(root, route + '.func'); fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x' }));
      fs.writeFileSync(path.join(directory, 'index.js'), 'export default 1;');
    }
    return fn(root, path.join(root, 'api/admin/teams/logo-export.func'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
test('inspects both actual function directories and fails closed without output', () => {
  assert.throws(() => checkFunctionBundles('/missing-sixfl-function-output'), /missing/);
  fixture(root => { const report = checkFunctionBundles(root); assert.equal(report.functions, 2); assert.equal(report.failures.length, 0); });
});
test('negative control: a sparse file exceeding budget is counted by uncompressed bytes', () => fixture((root, directory) => {
  const file = path.join(directory, 'oversized.bin'); const fd = fs.openSync(file, 'w');
  try { fs.ftruncateSync(fd, FUNCTION_BUDGET_BYTES + 1); } finally { fs.closeSync(fd); }
  assert.equal(checkFunctionBundles(root).failures[0].route, 'api/admin/teams/logo-export');
}));
test('Git metadata is rejected even if a bundle is otherwise small', () => fixture((root, directory) => {
  fs.mkdirSync(path.join(directory, '.git/objects/pack'), { recursive: true });
  fs.writeFileSync(path.join(directory, '.git/objects/pack/history.pack'), 'history');
  assert.match(checkFunctionBundles(root).failures[0].forbidden[0], /history.pack/);
}));
test('public kit images cannot be accidentally reintroduced to logo function packages', () => fixture((root, directory) => {
  fs.mkdirSync(path.join(directory, 'public/Kits'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'public/Kits/test.jpg'), 'artwork');
  assert.match(checkFunctionBundles(root).failures[0].forbidden[0], /public\/Kits/);
}));
test('external source links are conservatively materialised; cycles fail closed', () => fixture((root, directory) => {
  const target = path.join(root, 'shared.bin'); fs.writeFileSync(target, Buffer.alloc(1024));
  const baseline = inspectFunction(directory, 'api/admin/teams/logo-export').bytes;
  fs.symlinkSync(target, path.join(directory, 'one.bin')); fs.symlinkSync(target, path.join(directory, 'two.bin'));
  assert.equal(inspectFunction(directory, 'api/admin/teams/logo-export').bytes, baseline + 2048);
  fs.symlinkSync(directory, path.join(directory, 'loop')); assert.throws(() => checkFunctionBundles(root), /cycle/);
}));
test('internal aliases match ZIP uncompressed entry sizes, not duplicated dependency contents', () => fixture((root, directory) => {
  fs.mkdirSync(path.join(directory, 'node_modules/pkg'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'node_modules/pkg/data.bin'), Buffer.alloc(4096));
  fs.symlinkSync('node_modules/pkg', path.join(directory, 'package-alias'));
  fs.symlinkSync('node_modules/pkg/data.bin', path.join(directory, 'file-alias'));
  // Independent ZIP accounting: Vercel build-utils createZip represents a Unix
  // symlink as an entry containing its link target (lambda.ts), not its contents.
  const sum = Number(execFileSync('python3', ['-c', `import os,sys,zipfile,stat,io
root=sys.argv[1];buffer=io.BytesIO()
with zipfile.ZipFile(buffer,'w') as z:
 for base,dirs,files in os.walk(root,followlinks=False):
  for name in dirs+files:
   p=os.path.join(base,name);relative=os.path.relpath(p,root)
   if os.path.islink(p):
    entry=zipfile.ZipInfo(relative);entry.create_system=3;entry.external_attr=(stat.S_IFLNK|0o777)<<16
    z.writestr(entry,os.readlink(p).encode())
   elif os.path.isfile(p): z.write(p,relative)
with zipfile.ZipFile(buffer) as z: print(sum(i.file_size for i in z.infolist()))`, directory], { encoding: 'utf8' }));
  const measured = inspectFunction(directory, 'api/admin/teams/logo-export');
  assert.equal(measured.bytes, sum); assert.equal(measured.internalSymlinks, 2);
}));
test('internal alias does not hide an oversized real target', () => fixture((root, directory) => {
  const fd=fs.openSync(path.join(directory, 'large.bin'),'w');
  try { fs.ftruncateSync(fd,FUNCTION_BUDGET_BYTES+1); } finally { fs.closeSync(fd); }
  fs.symlinkSync('large.bin',path.join(directory,'alias'));
  assert.equal(checkFunctionBundles(root).failures.length,1);
}));
test('a missing required route cannot produce a false green result', () => fixture(root => {
  fs.rmSync(path.join(root, 'admin/teams/logos.func'), { recursive: true });
  assert.throws(() => checkFunctionBundles(root), /Required logo function/);
}));
