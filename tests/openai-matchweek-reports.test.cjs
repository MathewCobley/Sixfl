const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const ts = require("typescript");
const { PrismaClient } = require("@prisma/client");
const root = path.resolve(__dirname, "..");
const normalise = v => JSON.parse(JSON.stringify(v));
const base = "src/lib/matchweek-reports/";
const source = () => ({ leagueId: "test-league", leagueName: "Example League", area: "Example area", matchDate: "2026-09-09", omittedFixtures: 0, pendingFixtures: 0, warnings: [], matches: [{ fixtureId: "fixture-a", teamA: "Team Alpha", teamB: "Team Beta", scoreA: 1, scoreB: 3, scorers: [{ name: "Alex Example", team: "Team Beta", goals: 2 }], playersOfMatch: [] }] });
const article = () => ({ title: "Beta win the four-goal meeting", introduction: "Team Beta came out on top in the recorded result from Example League.", matches: [{ fixtureId: "fixture-a", paragraph: "Team Beta beat Team Alpha 3–1, with Alex Example scoring twice." }], closing: "" });
function loader(mocks = {}, env = {}, network = async () => { throw new Error("Network blocked in tests"); }) {
  const cache = new Map();
  const load = file => {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} }; cache.set(file, module.exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, console, Date, AbortSignal, Response, URL,
      process: { env: { NODE_ENV: "production", ...env } }, fetch: network,
      require(id) {
        if (id in mocks) return mocks[id];
        if (id.startsWith("./")) return load(path.posix.join(path.posix.dirname(file), `${id}.ts`));
        if (id.startsWith("@/lib/matchweek-reports/")) return load(`src/lib/matchweek-reports/${id.split("/").at(-1)}.ts`);
        if (id === "@/lib/datetime/london") return load("src/lib/datetime/london.ts");
        if (["node:crypto", "@prisma/client", "next/server", "next/dist/client/components/redirect-error"].includes(id)) return require(id);
        throw new Error(`Unexpected dependency: ${id}`);
      },
    }, { filename: file });
    return module.exports;
  };
  return load;
}
function provider(payload = article(), status = "completed") { return new Response(JSON.stringify({ status, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }] }), { status: 200 }); }

test("real Responses API request: one night, structured output, server key, store false and no contact data", async () => {
  let calls = 0;
  const load = loader({}, { OPENAI_API_KEY: "TEST_ONLY_NOT_A_KEY" }, async (url, opts) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(opts.body);
    assert.equal(opts.method, "POST"); assert.equal(body.store, false);
    assert.equal(body.text.format.type, "json_schema"); assert.equal(body.text.format.strict, true);
    assert.equal(body.model, "gpt-5.4-mini"); assert.ok(body.max_output_tokens <= 6000);
    assert.ok(opts.signal); assert.match(body.instructions, /untrusted DATA/);
    assert.doesNotMatch(body.input, /contactEmail|contactPhone|payment|private note|leak@example/);
    return provider();
  });
  const result = await load(`${base}openai.ts`).writeOpenAiReport({ ...source(), contactEmail: "leak@example.test", privateNotes: "private note" });
  assert.equal(result.matches[0].paragraph, article().matches[0].paragraph); assert.equal(calls, 1);
});

test("missing key, provider failure, timeout, refusal and incomplete output fail explicitly without templates or retry", async () => {
  const absent = loader(); await assert.rejects(absent(`${base}openai.ts`).writeOpenAiReport(source()), /not configured/);
  for (const network of [async () => new Response("SECRET_ERROR_MUST_NOT_LEAK", { status: 429 }), async () => { throw new Error("private error"); }, async () => provider({}, "incomplete"), async () => provider("not json")]) {
    let calls = 0;
    const load = loader({}, { OPENAI_API_KEY: "TEST" }, async (...args) => { calls++; return network(...args); });
    await assert.rejects(load(`${base}openai.ts`).writeOpenAiReport(source()), error => !/SECRET|private error|TEST/.test(error.message));
    assert.equal(calls, 1);
  }
});

test("generated validation checks fixture coverage, duplicates and invented scores; reversed winner score is valid", () => {
  const api = loader()(`${base}openai.ts`);
  assert.doesNotThrow(() => api.validateGenerated(article(), source()));
  for (const bad of [{ ...article(), matches: [] }, { ...article(), matches: [{ fixtureId: "other", paragraph: "Other game." }] }, { ...article(), matches: [{ fixtureId: "fixture-a", paragraph: "Beta won 8–0." }] }]) assert.throws(() => api.validateGenerated(bad, source()));
  assert.throws(() => loader()(`${base}types.ts`).validDate("2026-02-30"));
});

test("facts use one London date, not round number; omit unsafe outcomes and minimise scorer data", async () => {
  let query;
  const f = (id, extra = {}) => ({ id, status: "COMPLETED", kickoffAt: new Date("2026-09-09T18:00:00Z"), homeTeam: { id: "a", name: "Team Alpha" }, awayTeam: { id: "b", name: "Team Beta" }, result: { homeScore: 1, awayScore: 3, isDisputed: false, disputes: [], teamMetadata: [{ teamId: "b", scorers: [{ name: "Alex Example", goals: 2, email: "secret@example.test" }], playerOfMatchName: "Alex Example" }] }, ...extra });
  const list = [f("fixture-a"), f("replaced"), f("disputed", { result: { homeScore: 1, awayScore: 3, isDisputed: true, disputes: [] } }), f("pending", { status: "SCHEDULED", result: null }), f("cancelled", { status: "CANCELLED" })];
  const db = { league: { findFirst: async () => ({ id: "test-league", name: "Example", area: "Example" }) }, fixture: { findMany: async q => { query = q; return list; } }, $queryRaw: async () => [{ fixtureId: "replaced" }] };
  const load = loader({ "@/lib/prisma": { prisma: db }, "@/lib/teams/fixture-placeholders": { getFixturePlaceholderTeamIds: async () => new Set() } });
  const facts = load(`${base}facts.ts`);
  const result = await facts.getReportSource("example", "2026-09-09");
  assert.equal(query.where.kickoffAt.gte.toISOString(), "2026-09-08T23:00:00.000Z");
  assert.equal(query.where.kickoffAt.lt.toISOString(), "2026-09-09T23:00:00.000Z");
  assert.equal(query.where.round, undefined); assert.equal(query.take, undefined);
  assert.equal(result.matches.length, 1); assert.equal(result.pendingFixtures, 1); assert.equal(result.omittedFixtures, 3);
  assert.doesNotMatch(JSON.stringify(result), /secret@example/);
  assert.equal(facts.recordedScorers([{ name: "A", goals: 3 }, { name: "B", goals: 2 }], "Team", 3).length, 0);
  assert.equal(facts.recordedScorers([{ name: "email@example.test", goals: 1 }], "Team", 3).length, 0);
  await facts.getReportSource("example", "2026-10-25");
  assert.equal((query.where.kickoffAt.lt - query.where.kickoffAt.gte) / 3600000, 25, "DST fall-back is one London calendar day");
});

test("service read is side-effect free and every operation authorises before storage or provider", async () => {
  let reads = 0, writes = 0, calls = 0;
  const mocks = { "@/lib/requireAdmin": { requireAdmin: async () => ({ user: { id: "admin" } }) },
    "@/lib/prisma": { prisma: {} },
    "./facts": {} };
  const replacements = { ...mocks, "@/lib/matchweek-reports/facts": {} };
  // Relative source dependencies are replaced by the loader's file-cache-independent mocks below.
  replacements["./facts"] = { getReportSource: async () => { reads++; return source(); }, sourceHash: () => "hash" };
  replacements["./store"] = { readStoredReport: async () => ({ draft: null, generating: false, latestError: null }), claimGeneration: async () => { writes++; return { cached: false, draftId: "id" }; }, finishGeneration: async () => { writes++; }, failGeneration: async () => {} };
  replacements["./openai"] = { reportConfigured: () => true, reportModel: () => "test-model", writeOpenAiReport: async () => { calls++; return article(); } };
  const service = loader(replacements)(`${base}service.ts`);
  await service.getReportView("example", "2026-09-09"); assert.equal(reads, 1); assert.equal(calls + writes, 0);
  await service.generateReport("example", { requestId: randomUUID(), baseVersion: 0, matchDate: "2026-09-09", sourceHash: "hash" }); assert.equal(calls, 1); assert.equal(writes, 2);
  const blocked = loader({ ...replacements, "@/lib/requireAdmin": { requireAdmin: async () => { throw new Error("DENIED"); } } })(`${base}service.ts`);
  for (const method of ["getReportView", "generateReport", "saveReport"]) await assert.rejects(blocked[method]("example", {}), /DENIED/);
  assert.equal(calls, 1); assert.equal(writes, 2);
});

test("API denies unauthorised and cross-origin generation; GET uses only read service", async () => {
  const { NextRequest } = require("next/server");
  let writes = 0, reads = 0;
  const ctx = { params: Promise.resolve({ slug: "example" }) };
  const mocks = { "@/lib/requireAdmin": { requireAdmin: async () => ({ user: { id: "admin" } }) },
    "@/lib/matchweek-reports/service": { getReportView: async () => { reads++; return {}; }, generateReport: async () => { writes++; return {}; }, saveReport: async () => { writes++; return {}; } } };
  const route = loader(mocks)("src/app/api/admin/matchweek-reports/[slug]/route.ts");
  const request = (origin) => new NextRequest("https://sixfl.example/api/admin/matchweek-reports/example", { method: "POST", headers: { origin, "Content-Type": "application/json", "X-Sixfl-Report": "1" }, body: JSON.stringify({ action: "generate" }) });
  assert.equal((await route.POST(request("https://evil.example"), ctx)).status, 403); assert.equal(writes, 0);
  assert.equal((await route.POST(request("https://sixfl.example"), ctx)).status, 200); assert.equal(writes, 1);
  const res = await route.GET(new NextRequest("https://sixfl.example/api/admin/matchweek-reports/example?date=2026-09-09"), ctx);
  assert.equal(reads, 1); assert.equal(writes, 1); assert.match(res.headers.get("cache-control"), /no-store/);
});

const testDb = process.env.REPORT_TEST_DATABASE_URL;
test("real PostgreSQL draft storage: duplicate requests, saved edits, failures, locks, revisions and stale workers", { skip: !testDb }, async () => {
  const url = new URL(testDb);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/sixfl_report_test", "Only the disposable test database is permitted");
  const db = new PrismaClient({ datasourceUrl: testDb });
  const store = loader({ "@/lib/prisma": { prisma: db } })(`${base}store.ts`);
  const input = () => ({ actorId: randomUUID(), requestId: randomUUID(), baseVersion: 0, source: { ...source(), leagueId: randomUUID() }, sourceHash: "hash", model: "test-model" });
  const create = async i => db.$executeRaw`INSERT INTO "League" (id) VALUES (${i.source.leagueId})`;
  try {
    const i = input(); await create(i);
    const claim = await store.claimGeneration(i);
    await assert.rejects(store.claimGeneration(i), /already requested/);
    await store.finishGeneration(i, claim.draftId, article());
    assert.equal((await store.claimGeneration(i)).cached, true);
    const edited = { ...article(), title: "A manually edited headline" };
    const save = { actorId: i.actorId, requestId: randomUUID(), leagueId: i.source.leagueId, matchDate: i.source.matchDate, baseVersion: 1, content: edited };
    await store.storeEditedReport(save); await store.storeEditedReport(save);
    assert.equal((await store.readStoredReport(i.source.leagueId, i.source.matchDate)).draft.version, 2);
    await assert.rejects(store.storeEditedReport({ ...save, requestId: randomUUID() }), /newer version/);
    const revisions = await db.$queryRaw`SELECT * FROM "MatchweekReportRevision" WHERE "draftId"=${claim.draftId} ORDER BY "version"`;
    assert.equal(revisions.length, 2); assert.equal(revisions[0].content.title, article().title);
    assert.equal(revisions[1].content.title, edited.title);
    await db.$executeRaw`UPDATE "MatchweekReportRevision" SET "createdAt"=NOW()-INTERVAL '3 minutes' WHERE "draftId"=${claim.draftId}`;
    const next = { ...i, requestId: randomUUID(), baseVersion: 2 };
    const nextClaim = await store.claimGeneration(next);
    await assert.rejects(store.storeEditedReport({ ...save, requestId: randomUUID(), baseVersion: 2 }), /generation/);
    await store.failGeneration(next.requestId, "OpenAI unavailable");
    const retained = await store.readStoredReport(i.source.leagueId, i.source.matchDate);
    assert.equal(retained.draft.content.title, edited.title); assert.equal(retained.latestError, "OpenAI unavailable");
    await assert.rejects(store.finishGeneration(next, nextClaim.draftId, article()), /not overwritten/);
    const concurrent = input(); await create(concurrent);
    const outcomes = await Promise.allSettled([store.claimGeneration(concurrent), store.claimGeneration({ ...concurrent, requestId: randomUUID() })]);
    assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1);
  } finally { await db.$disconnect(); }
});
