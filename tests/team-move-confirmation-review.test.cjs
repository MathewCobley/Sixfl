const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const actionPath = "src/app/(admin)/admin/teams/move-confirmation-actions.ts";
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename, reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    assert.equal((result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    const localRequire = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      return require(id);
    };
    new Function("require", "module", "exports", result.outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}
const policy = loader()("src/lib/teams/move-confirmation.ts");
function harness(options = {}) {
  const writes = [], paths = [], events = [];
  const load = loader({
    "@/lib/requireAdmin": { requireAdmin: async () => {
      events.push("auth");
      if (options.authError) throw new Error("REDIRECT_LOGIN");
      return { user: options.noUser ? null : { id: "admin-id", name: "Test Admin", email: "admin@example.test" } };
    } },
    "@/lib/prisma": { prisma: { team: { updateMany: async input => {
      events.push("write"); writes.push(input);
      if (options.dbError) throw new Error("private database details");
      return { count: options.stale ? 0 : 1 };
    } } } },
    "next/cache": { revalidatePath: value => { paths.push(value); if (options.cacheError) throw new Error("Cache failure"); } },
  });
  return { ...load(actionPath), writes, paths, events };
}
const input = { teamId: "team-a", status: "CONFIRMED", previousStatus: "PENDING" };

test("the shared options distinguish awaiting response from an explicit no", () => {
  assert.deepEqual(policy.TEAM_MOVE_CONFIRMATION_OPTIONS.map(x => x.value), ["PENDING", "CONFIRMED", "DECLINED"]);
  assert.equal(policy.teamMoveConfirmationLabel("CONFIRMED"), "Confirmed — OK to move");
  assert.equal(policy.teamMoveConfirmationLabel("DECLINED"), "Not moving");
  for (const invalid of [null, undefined, {}, true, "", "MOVED", "confirmed"]) assert.equal(policy.isTeamMoveConfirmationStatus(invalid), false);
});

test("authentication is required before writes, including development bypass", async () => {
  const absent = harness({ noUser: true });
  assert.equal((await absent.saveTeamMoveConfirmation(input)).ok, false);
  assert.deepEqual(absent.writes, []);
  const redirected = harness({ authError: true });
  await assert.rejects(redirected.saveTeamMoveConfirmation(input), /REDIRECT_LOGIN/);
  assert.deepEqual(redirected.writes, []);
});

test("invalid statuses and malformed input never reach the database", async () => {
  for (const value of [null, {}, { ...input, teamId: " " }, { ...input, teamId: "x".repeat(201) }, { ...input, status: "MOVED" }, { ...input, previousStatus: "UNKNOWN" }]) {
    const h = harness();
    assert.equal((await h.saveTeamMoveConfirmation(value)).ok, false);
    assert.deepEqual(h.writes, []);
  }
});

test("save changes only the exact team's tracker and recorded last-update metadata", async () => {
  const h = harness();
  const result = await h.saveTeamMoveConfirmation(input);
  assert.equal(result.ok, true);
  assert.equal(result.status, "CONFIRMED");
  assert.equal(result.updatedBy, "Test Admin");
  assert.ok(!Number.isNaN(Date.parse(result.updatedAt)));
  assert.deepEqual(h.events, ["auth", "write"]);
  assert.deepEqual(h.writes[0].where, { id: "team-a", moveConfirmationStatus: "PENDING", league: { is: { isMoving: true } } });
  assert.deepEqual(Object.keys(h.writes[0].data).sort(), ["moveConfirmationStatus", "moveConfirmationUpdatedAt", "moveConfirmationUpdatedBy"].sort());
  assert.deepEqual(h.paths, ["/admin/teams", "/admin/teams/team-a"]);
});

test("declining and resetting are valid responses, not league transfer actions", async () => {
  for (const status of ["DECLINED", "PENDING"]) {
    const h = harness();
    assert.equal((await h.saveTeamMoveConfirmation({ ...input, status, previousStatus: "CONFIRMED" })).status, status);
    assert.equal(h.writes[0].data.moveConfirmationStatus, status);
    assert.equal("leagueId" in h.writes[0].data, false);
  }
});

test("a different saved response or a removed team is not reported as saved", async () => {
  const h = harness({ stale: true });
  const result = await h.saveTeamMoveConfirmation(input);
  assert.equal(result.ok, false);
  assert.match(result.error, /Reload/);
  assert.deepEqual(h.paths, []);
});

test("database failure is explicit and never leaks database details", async () => {
  const result = await harness({ dbError: true }).saveTeamMoveConfirmation(input);
  assert.equal(result.ok, false);
  assert.match(result.error, /Could not save/);
  assert.equal(result.error.includes("private"), false);
});

test("a cache refresh failure does not falsely undo a completed save", async () => {
  const h = harness({ cacheError: true });
  assert.equal((await h.saveTeamMoveConfirmation(input)).ok, true);
  assert.equal(h.writes.length, 1);
});

test("prepared Teams list and settings both retain the native dropdown and existing controls", () => {
  const list = fs.readFileSync(path.join(root, "src/app/(admin)/admin/teams/page.tsx"), "utf8");
  const detail = fs.readFileSync(path.join(root, "src/app/(admin)/admin/teams/[id]/page.tsx"), "utf8");
  for (const source of [list, detail]) {
    assert.ok(source.includes("<TeamMoveConfirmationSelect"));
    assert.ok(source.includes("teamId={team.id}"));
    assert.ok(source.includes("initialStatus={team.moveConfirmationStatus}"));
    assert.ok(source.includes("initialUpdatedAt={team.moveConfirmationUpdatedAt?.toISOString() ?? null}"));
  }
  for (const field of ["moveConfirmationStatus", "moveConfirmationUpdatedAt", "moveConfirmationUpdatedBy"]) assert.ok(list.includes(`${field}: true`));
  for (const control of ["Copy claim link", "Captain view", "deleteTeamAction"]) assert.ok(list.includes(control));
  for (const control of ["updateTeamDetailsAction", "Team settings", "EmailHtmlPreview"]) assert.ok(detail.includes(control));
});

test("schema and migration default all existing teams to pending without consent inference", () => {
  const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
  assert.match(schema, /moveConfirmationStatus\s+TeamMoveConfirmationStatus\s+@default\(PENDING\)/);
  const sql = fs.readFileSync(path.join(root, "prisma/migrations/20260906124500_team_move_confirmation/migration.sql"), "utf8");
  assert.ok(sql.includes("NOT NULL DEFAULT 'PENDING'"));
  assert.equal(/\bUPDATE\s+"(?:Team|Fixture|PaymentCharge)"/i.test(sql), false);
});

module.exports = { loader, root };
