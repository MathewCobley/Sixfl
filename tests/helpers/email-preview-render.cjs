const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "../..");
const cache = new Map();

function load(file) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    reportDiagnostics: true,
  });
  const errors = (compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: value => value, getCurrentDirectory: () => root, getNewLine: () => "\n",
  }));
  function localRequire(id) {
    if (!id.startsWith("@/") && !id.startsWith(".")) return require(id);
    const candidate = id.startsWith("@/") ? path.join(root, "src", id.slice(2)) : path.resolve(path.dirname(filename), id);
    const resolved = [candidate, `${candidate}.ts`, `${candidate}.tsx`].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!resolved) throw new Error(`Cannot resolve test module ${id}`);
    return load(resolved);
  }
  new Function("require", "module", "exports", compiled.outputText)(localRequire, module, module.exports);
  return module.exports;
}

const preview = load("src/components/admin/email/EmailHtmlPreview.tsx");
function renderPreview(html, props = {}) {
  return renderToStaticMarkup(React.createElement(preview.default, { html, ...props }));
}
module.exports = { ...preview, load, renderPreview, root };
