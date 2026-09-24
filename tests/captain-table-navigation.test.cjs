const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const pageFile = "src/app/captain/team/[teamid]/table/page.tsx";
const moreFile = "src/app/captain/team/[teamid]/more/page.tsx";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const Table = () => null;
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });

// Execute the actual server-page functions, with I/O and JSX rendering isolated.
// These are component/route unit tests, not browser scrolling or live-DB tests.
function load(file, mocks = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(read(file), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const defaults = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "next/link": { __esModule: true, default: "a" },
    "@heroicons/react/24/outline": new Proxy({}, { get: () => "icon" }),
    "@/components/captain/CaptainAppScreens.module.css": { __esModule: true, default: {} },
    "@/components/captain/CaptainDashboardLeagueTable": { __esModule: true, default: Table },
  };
  new Function("require", "module", "exports", compiled.outputText)((id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (Object.hasOwn(defaults, id)) return defaults[id];
    throw new Error(`Unexpected dependency: ${id}`);
  }, module, module.exports);
  return module.exports;
}
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object") return [];
  return [value, ...nodes(value.props?.children)];
}
function text(value) {
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (value && typeof value === "object") return text(value.props?.children);
  return typeof value === "string" ? value : "";
}
const tableNode = (tree) => nodes(tree).find(node => node.type === Table);
const row = (teamId, points = 12) => ({ teamId, teamName: teamId, points });
function harness({ context, standings, deny = false } = {}) {
  const calls = [];
  const selectedContext = context === undefined ? {
    team: { id: "old-team", leagueId: "old-season" },
    currentLeagueId: "current-season",
    currentLeague: { name: "Tuesday League" },
    relatedTeamIds: ["old-team", "current-team"],
  } : context;
  const selectedStandings = standings ?? { hasDivisions: false, divisions: [], rows: [row("current-team"), row("rival")] };
  const mocks = {
    "@/lib/requireCaptain": { requireCaptain: async id => {
      calls.push(["auth", id]);
      if (deny) throw new Error("DENIED");
    } },
    "@/lib/captain/related-teams": { getCaptainRelatedTeamContext: async id => {
      calls.push(["context", id]);
      return selectedContext;
    } },
    "@/lib/standings": { getLeagueStandings: async id => {
      calls.push(["standings", id]);
      return selectedStandings;
    } },
  };
  const page = load(pageFile, mocks);
  return { calls, page, mocks, run: (teamid = "old-team") => page.default({ params: Promise.resolve({ teamid }) }) };
}

test("desktop Table link changes pathname and targets the server-rendered table screen", () => {
  const layout = read("src/app/captain/team/[teamid]/layout.tsx");
  const match = layout.match(/href:\s*`([^`]+)`\s*,\s*label:\s*"Table"/);
  assert.ok(match, "a real Table navigation item must exist");
  const destination = new URL(match[1].replace("${teamid}", "team-a"), "https://example.invalid");
  assert.equal(destination.pathname, "/captain/team/team-a/table");
  assert.equal(destination.hash, "#captain-table");
  assert.doesNotMatch(layout, /href:\s*`[^`]*#captain-league-table`/);
  assert.match(read(pageFile), /id="captain-table"/);
  assert.doesNotMatch(read(pageFile), /CaptainPwaModeOnly|redirect\(|querySelector|MutationObserver/);
  // The existing navigation scroll reset must not override the new target.
  assert.match(read("src/components/captain/CaptainTeamScrollToTop.tsx"), /window\.location\.hash\) return/);
});

test("table route authorises first and reads the current season, not the legacy team league", async () => {
  const h = harness();
  const tree = await h.run();
  assert.deepEqual(h.calls, [["auth", "old-team"], ["context", "old-team"], ["standings", "current-season"]]);
  assert.equal(tree.props.id, "captain-table");
  assert.equal(tree.props["data-captain-table-page"], true);
  assert.equal(tableNode(tree).props.rows[0].teamId, "current-team");
  assert.equal(h.page.dynamic, "force-dynamic");
  assert.equal(h.page.revalidate, 0);
});

test("captain sees their own division using related team IDs, without mixing divisions", async () => {
  const first = { id: "prem", name: "Premiership", rows: [row("other")] };
  const second = { id: "champ", name: "Championship", rows: [row("current-team", 7), row("rival", 5)] };
  const h = harness({ standings: { hasDivisions: true, divisions: [first, second], rows: [...first.rows, ...second.rows] } });
  const table = tableNode(await h.run());
  assert.deepEqual(table.props.rows, second.rows);
  assert.match(table.props.title, /Championship/);
  assert.equal(table.props.rows[0].points, 7, "standings totals are passed through, never recalculated");
});

test("empty division records retain the authoritative season table fallback", async () => {
  const rows = [row("current-team")];
  const h = harness({ standings: { hasDivisions: true, divisions: [{ name: "Empty", rows: [] }], rows } });
  assert.deepEqual(tableNode(await h.run()).props.rows, rows);
});

test("a team awaiting division assignment does not see a combined false ranking", async () => {
  const rows = [row("someone-else")];
  const h = harness({ standings: { hasDivisions: true, divisions: [{ name: "Premiership", rows }], rows } });
  const tree = await h.run();
  assert.equal(tree.props.id, "captain-table");
  assert.equal(tableNode(tree), undefined);
  assert.match(text(tree), /not been assigned to a division/);
});

test("a team without a league gets an anchored empty state without a standings read", async () => {
  const h = harness({ context: { currentLeagueId: null, currentLeague: null, relatedTeamIds: ["old-team"] } });
  const tree = await h.run();
  assert.equal(tree.props.id, "captain-table");
  assert.equal(tableNode(tree), undefined);
  assert.match(text(tree), /not assigned to a league/);
  assert.equal(h.calls.some(call => call[0] === "standings"), false);
});

test("an empty league renders the existing table's empty message", async () => {
  const h = harness({ standings: { hasDivisions: false, divisions: [], rows: [] } });
  const table = tableNode(await h.run());
  assert.deepEqual(table.props.rows, []);
  assert.match(table.props.emptyMessage, /once teams have been added/);
});

test("denied captains cannot read team context or standings", async () => {
  const h = harness({ deny: true });
  await assert.rejects(h.run("other-team"), /DENIED/);
  assert.deepEqual(h.calls, [["auth", "other-team"]]);
});

test("unknown teams return not-found before a standings read", async () => {
  const h = harness({ context: null });
  await assert.rejects(h.run(), /NOT_FOUND/);
  assert.equal(h.calls.some(call => call[0] === "standings"), false);
});

test("app More links open the dedicated screen for whichever team is selected", async () => {
  for (const teamid of ["team-a", "team-b"]) {
    const h = harness();
    const page = load(moreFile, h.mocks);
    const tree = await page.default({ params: Promise.resolve({ teamid }) });
    const links = nodes(tree).filter(node => node.type === "a");
    const matches = links.filter(node => text(node).trim() === "League table");
    assert.equal(matches.length, 1);
    assert.equal(matches[0].props.href, `/captain/team/${teamid}/table#captain-table`);
    assert.ok(links.some(node => node.props.href === `/player/team/${teamid}`), "retain the existing account switch");
    assert.deepEqual(h.calls, [["auth", teamid]]);
  }
});

test("app header names the table screen and keeps More selected", () => {
  const { getCaptainAppSection } = load("src/lib/captain/app-navigation.ts");
  for (const suffix of ["/table", "/table/", "/table#captain-table"]) {
    assert.deepEqual(getCaptainAppSection(`/captain/team/a${suffix}`, "a"), { title: "League table", tab: "More" });
  }
  assert.deepEqual(getCaptainAppSection("/captain/team/a", "a"), { title: "Home", tab: "Home" });
  assert.deepEqual(getCaptainAppSection("/captain/team/b/table", "a"), { title: "Captain", tab: null });
});
