const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

// Load the real implementation. No provider, network, database or credentials.
function loader(env = {}, network = async () => { throw new Error("Network disabled in tests"); }) {
  const cache = new Map();
  const load = file => {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
      fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, URL, Date, AbortSignal, Response,
      process: { env }, fetch: network,
      require(id) {
        if (id.startsWith("./")) return load(path.posix.join(path.posix.dirname(file), `${id}.ts`));
        if (id.startsWith("@/lib/matchweek-reports/")) return load(`src/lib/matchweek-reports/${id.split("/").at(-1)}.ts`);
        throw new Error(`Unexpected dependency: ${id}`);
      },
    }, { filename: file });
    return module.exports;
  };
  return load;
}
const base = "src/lib/matchweek-reports/";
const load = loader();
const { verifiedTableStatements, assertVerifiedTableClaims } = load(`${base}table-claims.ts`);
const row = (team, points, position, goalDifference = 10) => ({
  team, points, position, goalDifference, played: 8, won: 6, drawn: 0, lost: 2,
  goalsFor: 30, goalsAgainst: 30 - goalDifference, recentForm: ["W"],
});
const source = () => ({
  leagueId: "test", leagueName: "Example League", area: null, matchDate: "2026-09-23",
  matches: [{ fixtureId: "f1", teamA: "AHC", teamB: "Absolutely Plastered", scoreA: 1, scoreB: 3, scorers: [], playersOfMatch: [] }],
  standingsBeforeNight: [{ division: null, rows: [row("AHC", 24, 1, 20), row("Absolutely Plastered", 18, 2, 10)] }],
  standingsAfterNight: [{ division: null, rows: [row("AHC", 24, 1, 18), row("Absolutely Plastered", 21, 2, 12)] }],
  pendingFixtures: 0, omittedFixtures: 0, warnings: [],
});
const content = (paragraph = "Absolutely Plastered beat AHC 3–1.") => ({
  title: "Plastered win", introduction: "A win for Absolutely Plastered.", matches: [{ fixtureId: "f1", paragraph }], closing: "",
});
const rejected = (text, s = source()) => assert.throws(() => assertVerifiedTableClaims(content(text), s), /unverified points or goal-difference claim/);

test("regression: AHC not level on points and not top on goal difference", () => {
  const text = "That ended AHC’s unbeaten start and left them level on points but still top on goal difference.";
  rejected(text);
  const facts = verifiedTableStatements(source());
  assert.ok(facts.includes("AHC finished the night top, 3 points ahead of Absolutely Plastered."));
  assert.ok(!facts.some(s => /level on|on goal difference/.test(s)));
});

test("actual snapshot points are used, not won * 3 (including double points)", () => {
  const s = source();
  assert.equal(s.standingsAfterNight[0].rows[0].won * 3, 18);
  assert.ok(verifiedTableStatements(s).includes("AHC finished the night in 1st place on 24 points."));
  rejected("AHC finished the night in 1st place on 18 points.", s);
});

test("approved standalone sentences survive alongside ordinary match prose", () => {
  const s = source();
  const facts = verifiedTableStatements(s);
  for (const fact of facts) assert.doesNotThrow(() => assertVerifiedTableClaims(content(`Plastered won 3–1. ${fact}`), s));
  assert.doesNotThrow(() => assertVerifiedTableClaims(content(facts.join(" ")), s));
});

test("claim checks cover headline, introduction, every match paragraph and closing", () => {
  for (const field of ["title", "introduction", "closing"]) {
    const c = content(); c[field] = "AHC and Absolutely Plastered are level on points.";
    assert.throws(() => assertVerifiedTableClaims(c, source()), /unverified/);
  }
  rejected("AHC are level on points.");
});

test("equal points permit equality and top on GD only when GD really separates them", () => {
  const s = source(); s.standingsAfterNight[0].rows[1].points = 24;
  const sentence = "AHC finished the night top, ahead of Absolutely Plastered on goal difference with both on 24 points.";
  assert.ok(verifiedTableStatements(s).includes(sentence));
  assert.doesNotThrow(() => assertVerifiedTableClaims(content(sentence), s));
  s.standingsAfterNight[0].rows[1].goalDifference = 18;
  assert.ok(!verifiedTableStatements(s).includes(sentence));
  rejected(sentence, s);
});

test("before/after night facts cannot silently change time period", () => {
  const s = source();
  assert.ok(verifiedTableStatements(s).includes("AHC started the night 6 points ahead of Absolutely Plastered."));
  rejected("AHC finished the night 6 points ahead of Absolutely Plastered.", s);
});

test("partial and omitted nights never allow end-of-night points claims", () => {
  for (const key of ["pendingFixtures", "omittedFixtures"]) {
    const s = source(); s[key] = 1;
    assert.ok(verifiedTableStatements(s).every(x => !x.includes("finished the night")));
    rejected("AHC finished the night in 1st place on 24 points.", s);
  }
});

test("missing context allows match-only copy but never guessed points", () => {
  const s = source(); delete s.standingsBeforeNight; delete s.standingsAfterNight;
  assert.equal(verifiedTableStatements(s).length, 0);
  assert.doesNotThrow(() => assertVerifiedTableClaims(content(), s));
  rejected("AHC finished the night top on goal difference.", s);
});

test("comparisons never cross divisions", () => {
  const s = source(); delete s.standingsBeforeNight;
  s.standingsAfterNight = [
    { division: "Premiership", rows: [row("AHC", 24, 1)] },
    { division: "Championship", rows: [row("Absolutely Plastered", 24, 1)] },
  ];
  assert.ok(!verifiedTableStatements(s).some(x => x.includes("level on")));
  rejected("AHC and Absolutely Plastered finished the night level on 24 points.", s);
});

test("ambiguous, incorrectly ordered and non-numeric rows fail closed", () => {
  for (const mutation of [r => r[1].team = "AHC", r => r[0].points = NaN, r => r[1].points = 25, r => r[0].position = 2]) {
    const s = source(); delete s.standingsBeforeNight; mutation(s.standingsAfterNight[0].rows);
    assert.equal(verifiedTableStatements(s).length, 0);
  }
});

test("names containing protected words are data and don't block match prose", () => {
  const s = source(); s.matches[0].teamB = "Three Points FC";
  s.matches[0].scorers = [{ name: "Joe Points", team: "Three Points FC", goals: 2 }];
  assert.doesNotThrow(() => assertVerifiedTableClaims(content("Three Points FC won 3–1. Joe Points scored twice."), s));
  rejected("Three Points FC won 3–1 and are level on points with AHC.", s);
});

test("valid sentences cannot be embedded inside negation or changed numbers", () => {
  const fact = "AHC finished the night in 1st place on 24 points.";
  rejected(`It is not true that ${fact}`);
  rejected(fact.replace("24", "21"));
  rejected(`Not ${fact}`);
});

test("whitespace and curly apostrophes do not invalidate an approved sentence", () => {
  const s = source(); s.standingsAfterNight[0].rows[0].team = "AHC’s Team";
  const fact = verifiedTableStatements(s).find(x => x.startsWith("AHC’s Team finished"));
  assert.doesNotThrow(() => assertVerifiedTableClaims(content(fact.replaceAll(" ", "\n").replace("’", "'")), s));
});

test("common equality and GD alternatives cannot bypass the gate", () => {
  for (const text of ["They are joint-top.", "They are tied at the top.", "They lead on GD.", "They are level on 24 pts.", "They lead on goals scored.", "They are ahead on goal-difference."])
    rejected(text);
});

test("negative controls prove an incorrect equality cannot pass in a valid sentence shape", () => {
  const s = source();
  rejected("AHC and Absolutely Plastered finished the night level on 24 points.", s);
  s.standingsAfterNight[0].rows[1].points = 24;
  assert.doesNotThrow(() => assertVerifiedTableClaims(content("AHC and Absolutely Plastered finished the night level on 24 points."), s));
});

test("the real generation validator rejects the regression and still checks scorelines", () => {
  const api = load(`${base}openai.ts`);
  assert.throws(() => api.validateGenerated(content("AHC are level on points but top on goal difference."), source()), /unverified/);
  assert.throws(() => api.validateGenerated(content("Plastered won 9–0."), source()), /score/);
  assert.doesNotThrow(() => api.validateGenerated(content("Plastered won 3–1. AHC finished the night top, 3 points ahead of Absolutely Plastered."), source()));
});

const ids = [{ id: "f1", homeTeam: { id: "a", name: "AHC", logoUrl: null }, awayTeam: { id: "b", name: "Absolutely Plastered", logoUrl: null } }];
const settings = { coverUrl: "", coverAlt: "", coverCaption: "" };

test("preview/publication rechecks cached and edited drafts independently of generation", () => {
  const { buildNewsSnapshot } = load("src/lib/league-news/snapshot.ts");
  assert.throws(() => buildNewsSnapshot(source(), content("AHC are level on points."), ids, settings), /unverified/);
  const article = buildNewsSnapshot(source(), content("AHC finished the night top, 3 points ahead of Absolutely Plastered."), ids, settings);
  assert.match(article.matches[0].paragraph, /3 points ahead/);
  assert.equal(article.standingsAfterNight, undefined, "private context is not published");
});

test("published historical snapshots remain readable and are never rewritten by this change", () => {
  const { buildNewsSnapshot, readNewsSnapshot } = load("src/lib/league-news/snapshot.ts");
  const published = buildNewsSnapshot(source(), content(), ids, settings);
  published.matches[0].paragraph = "Historical copy says AHC are level on points.";
  assert.equal(readNewsSnapshot(published).matches[0].paragraph, published.matches[0].paragraph);
});

test("actual writer sends computed statements and accepts supported copy (mocked provider)", async () => {
  let calls = 0;
  const fact = "AHC finished the night top, 3 points ahead of Absolutely Plastered.";
  const api = loader({ OPENAI_API_KEY: "NOT_A_REAL_KEY" }, async (_url, opts) => {
    calls++;
    const request = JSON.parse(opts.body), input = JSON.parse(request.input);
    assert.ok(input.verifiedTableStatements.includes(fact));
    assert.equal(input.standingsAfterNight[0].rows[0].points, 24);
    assert.match(request.instructions, /copied verbatim from verifiedTableStatements/);
    return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(content(fact)) }] }] }), { status: 200 });
  })(`${base}openai.ts`);
  assert.equal((await api.writeOpenAiReport(source())).matches[0].paragraph, fact);
  assert.equal(calls, 1);
});

test("actual writer rejects incorrect provider prose without a second provider call", async () => {
  let calls = 0;
  const api = loader({ OPENAI_API_KEY: "NOT_A_REAL_KEY" }, async () => {
    calls++;
    return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(content("AHC are level on points but top on goal difference.")) }] }] }), { status: 200 });
  })(`${base}openai.ts`);
  await assert.rejects(api.writeOpenAiReport(source()), /unverified/);
  assert.equal(calls, 1);
});
