const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const { NextRequest } = require("next/server");

test("report mutations accept Railway's forwarded browser origin and reject cross-site or unauthorised requests", async () => {
  let writes = 0;
  let authorised = true;
  class ReportError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const file = path.resolve(__dirname, "../src/app/api/admin/matchweek-reports/[slug]/route.ts");
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks = {
    "@/lib/requireAdmin": { requireAdmin: async () => { if (!authorised) throw new ReportError("Sign in as admin", 401); } },
    "@/lib/matchweek-reports/types": { ReportError },
    "@/lib/matchweek-reports/service": { generateReport: async () => { writes++; return {}; }, saveReport: async () => { writes++; return {}; } },
  };
  vm.runInNewContext(code, { module, exports: module.exports, URL, console, process: { env: { NEXTAUTH_URL: "https://www.sixfl.example" } }, require(id) {
    if (id in mocks) return mocks[id];
    if (["next/server", "next/dist/client/components/redirect-error"].includes(id)) return require(id);
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  const route = module.exports;
  const context = { params: Promise.resolve({ slug: "example" }) };
  const request = (origin, extra = {}) => new NextRequest("http://0.0.0.0:8080/api/admin/matchweek-reports/example", {
    method: "POST", headers: { origin, "x-forwarded-host": "sixfl.example", "Content-Type": "application/json", "X-Sixfl-Report": "1", ...extra }, body: JSON.stringify({ action: "generate" }),
  });
  assert.equal((await route.POST(request("https://sixfl.example"), context)).status, 200);
  assert.equal(writes, 1);
  for (const [origin, extra] of [["https://evil.example", {}], ["null", {}], ["https://sixfl.example", { "sec-fetch-site": "cross-site" }], ["https://sixfl.example", { "X-Sixfl-Report": "" }]]) {
    assert.equal((await route.POST(request(origin, extra), context)).status, 403);
  }
  authorised = false;
  assert.equal((await route.POST(request("https://sixfl.example"), context)).status, 401);
  assert.equal(writes, 1, "rejected requests must not reach generation or saving");
});
