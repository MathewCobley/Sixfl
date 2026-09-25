const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');

function harness(prisma, overrides = {}) {
  const cache = new Map();
  const mocks = {
    '@/lib/prisma': { prisma },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect(location) { throw Object.assign(new Error('REDIRECT'), { location }); } },
    ...overrides,
  };
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const source = fs.readFileSync(absolute, 'utf8');
    const result = ts.transpileModule(source, { fileName: absolute, reportDiagnostics: true, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } });
    assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file);
    const mod = { exports: {} }; cache.set(absolute, mod);
    const dependency = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      const local = id.startsWith('@/') ? path.resolve('src', id.slice(2))
        : id.startsWith('.') ? path.resolve(path.dirname(absolute), id) : null;
      if (local) {
        if (Object.hasOwn(mocks, local)) return mocks[local];
        const found = [local, local + '.ts', local + '.tsx'].find(f => fs.existsSync(f) && fs.statSync(f).isFile());
        if (!found) throw Error(`Unknown source import ${id}`);
        return load(found);
      }
      if (['crypto', 'node:crypto', '@prisma/client', 'react', 'react/jsx-runtime'].includes(id)) return require(id);
      throw Error(`External dependency blocked: ${id}`);
    };
    new Function('require', 'module', 'exports', 'fetch', result.outputText)(dependency, mod, mod.exports,
      () => { throw Error('External network disabled'); });
    return mod.exports;
  }
  return { load };
}
module.exports = { harness };
