const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const compile = (source, file) => ts.transpileModule(source, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function load(file, stubs = {}) {
  const filename = path.resolve(file); const m = new Module(filename, module);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  m.require = spec => {
    if (Object.hasOwn(stubs, spec)) return stubs[spec];
    const local = spec.startsWith('@/') ? path.resolve('src', spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(filename), spec) : null;
    if (local) for (const suffix of ['', '.ts', '.tsx']) if (fs.existsSync(local + suffix) && fs.statSync(local + suffix).isFile()) return load(local + suffix, stubs);
    return require(spec);
  };
  m._compile(compile(fs.readFileSync(filename, 'utf8'), filename), filename); return m.exports;
}
module.exports = { load };
