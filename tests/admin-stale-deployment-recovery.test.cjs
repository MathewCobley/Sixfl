const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const componentPath = "src/components/admin/AdminDeploymentRecovery.tsx";
const errorPath = "src/app/(admin)/admin/error.tsx";
const layoutPath = "src/app/(admin)/admin/layout.tsx";

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function loadRecovery() {
  const code = ts.transpileModule(read(componentPath), {
    fileName: componentPath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports")(require, module, module.exports);
  return module.exports;
}

test("recognises only stale Server Action deployment errors", () => {
  const recovery = loadRecovery();
  assert.equal(
    recovery.isStaleAdminDeploymentError(
      'Failed to find Server Action "abc". This request might be from an older or newer deployment.',
    ),
    true,
  );
  assert.equal(
    recovery.isStaleAdminDeploymentError(new Error("Server Action abc was not found")),
    true,
  );
  assert.equal(
    recovery.isStaleAdminDeploymentError(new Error("Database connection failed")),
    false,
  );
});

test("reloads once per admin page within the loop guard window", () => {
  const recovery = loadRecovery();
  const store = new Map();
  let reloads = 0;
  global.window = {
    location: {
      pathname: "/admin/leads",
      search: "?status=NEW",
      reload() {
        reloads += 1;
      },
    },
    sessionStorage: {
      getItem(key) {
        return store.get(key) ?? null;
      },
      setItem(key, value) {
        store.set(key, value);
      },
    },
  };

  try {
    assert.equal(recovery.reloadAdminForStaleDeployment(), true);
    assert.equal(reloads, 1);
    assert.equal(recovery.reloadAdminForStaleDeployment(), false);
    assert.equal(reloads, 1);
  } finally {
    delete global.window;
  }
});

test("admin shell mounts recovery and supplies a route error boundary", () => {
  const layout = read(layoutPath);
  const errorPage = read(errorPath);
  const component = read(componentPath);

  assert.match(layout, /AdminDeploymentRecovery/);
  assert.match(layout, /<AdminDeploymentRecovery\s*\/?>/);
  assert.match(errorPage, /reloadAdminForStaleDeployment/);
  assert.match(errorPage, /Reload SIXFL/);
  assert.match(component, /unhandledrejection/);
  assert.match(component, /window\.location\.reload\(\)/);
  assert.equal(/MutationObserver|querySelector|innerHTML/.test(component), false);
});
