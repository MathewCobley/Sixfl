const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Run real pages, navigation and the production requireAdmin policy with isolated I/O.
// No production database, session, provider or network is used.
const root = path.resolve(__dirname, "..");
const indexPath = "src/app/(admin)/admin/matchweek-reports/page.tsx";
const detailPath = "src/app/(admin)/admin/matchweek-reports/[slug]/page.tsx";
const legacyPath = "src/app/(public)/leagues/[slug]/weekly-report/page.tsx";
const pages = [indexPath, detailPath, legacyPath];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const load = (file, mocks, transform = (source) => source) => {
  const { outputText } = ts.transpileModule(transform(read(file)), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const module = { exports: {} };
  const allowed = new Set(["react", "react/jsx-runtime", "@heroicons/react/24/outline", "react-icons/hi"]);
  vm.runInNewContext(outputText, {
    module, exports: module.exports, console,
    process: { env: { NODE_ENV: "production" } },
    require(id) {
      if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
      if (allowed.has(id)) return require(id);
      throw new Error(`Unexpected dependency (I/O blocked): ${id}`);
    },
  }, { filename: file });
  return module.exports;
};
class NavigationExit extends Error {
  constructor(destination) { super(destination); this.destination = destination; }
}
const exampleLeague = () => ({
  id: "test-league", name: "Report Test League", slug: "example", area: "Test area", season: "Test season", badgeUrl: null,
  fixtures: [{
    id: "test-fixture", kickoffAt: new Date("2026-09-09T18:00:00Z"), round: 1,
    homeTeam: { id: "a", name: "Test Team A", logoUrl: null },
    awayTeam: { id: "b", name: "Test Team B", logoUrl: null },
    result: { homeScore: 1, awayScore: 3, teamMetadata: [{ teamId: "b", scorers: [], playerOfMatchName: "Test player" }] },
  }],
});
function harness(role = null, email = "example@example.test") {
  const state = { session: role ? { user: { email } } : null, user: role ? { role, email } : null, queries: [], league: exampleLeague(), leagues: [exampleLeague()] };
  const navigation = {
    redirect(destination) { throw new NavigationExit(destination); },
    notFound() { throw new NavigationExit("404"); },
    usePathname: () => "/admin/matchweek-reports/example",
  };
  const mocks = {
    "next/navigation": navigation,
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/image": { __esModule: true, default: () => null },
    "next-auth": { getServerSession: async () => state.session },
    "next-auth/react": { useSession: () => ({ data: state.session }) },
    "@/auth": { authOptions: {} },
    "@prisma/client": { UserRole: { ADMIN: "ADMIN" } },
    "@vercel/analytics": { track() {} },
    "@/lib/datetime/london": { formatDateTimeInLondon: (value, options) => new Date(value).toLocaleString("en-GB", { ...options, timeZone: "Europe/London" }) },
    "@/lib/prisma": { prisma: {
      user: { findUnique: async () => state.user },
      league: {
        findMany: async (query) => { state.queries.push(query); return state.leagues; },
        findFirst: async (query) => { state.queries.push(query); return state.league; },
      },
    } },
  };
  mocks["@/lib/requireAdmin"] = load("src/lib/requireAdmin.ts", mocks);
  return { state, mocks };
}
const props = () => ({ params: Promise.resolve({ slug: "example" }) });

for (const role of [null, "USER", "REFEREE"]) {
  for (const page of pages) {
    test(`${role || "anonymous"} cannot access ${page}`, async () => {
      const { state, mocks } = harness(role);
      await assert.rejects(load(page, mocks).default(props()), (error) => error instanceof NavigationExit && error.destination === (role ? "/dashboard" : "/login"));
      assert.equal(state.queries.length, 0, "authorization must finish before report data is queried");
    });
  }
}

for (const [role, email] of [["ADMIN", "admin@example.test"], ["USER", "hello@sixfl.co.uk"]]) {
  test(`${email} can choose a league and open a private preview`, async () => {
    const { state, mocks } = harness(role, email);
    const index = load(indexPath, mocks);
    const html = renderToStaticMarkup(await index.default());
    assert.match(html, /href="\/admin\/matchweek-reports\/example"/);
    assert.match(html, /Report Test League/);
    const detail = load(detailPath, mocks);
    const report = renderToStaticMarkup(await detail.default(props()));
    assert.match(report, /Admin-only preview/);
    assert.match(report, /not published/);
    assert.match(report, /Test Team A/);
    assert.match(report, /Test Team B/);
    assert.match(report, /Test player/);
    assert.equal(index.metadata.robots.index, false);
    assert.equal(detail.metadata.robots.index, false);
    assert.equal(state.queries[0].where.isActive, true);
    assert.equal(state.queries[1].where.slug, "example");
    assert.equal(state.queries[1].select.fixtures.where.status, "COMPLETED");
    assert.equal(state.queries[1].select.fixtures.where.publishedAt.not, null);
    state.queries.length = 0;
    const legacy = load(legacyPath, mocks);
    await assert.rejects(legacy.default(props()), (error) => error.destination === "/admin/matchweek-reports/example");
    assert.equal(state.queries.length, 0, "old public route must only redirect, not read results");
    assert.equal(legacy.metadata.robots.index, false);
  });
}

test("private empty states and unknown league are handled", async () => {
  const { state, mocks } = harness("ADMIN");
  state.leagues = [];
  assert.match(renderToStaticMarkup(await load(indexPath, mocks).default()), /No active leagues/);
  state.league.fixtures = [];
  assert.match(renderToStaticMarkup(await load(detailPath, mocks).default(props())), /No completed results yet/);
  state.league = null;
  await assert.rejects(load(detailPath, mocks).default(props()), (error) => error.destination === "404");
});

test("report navigation is present in admin sidebar and menus but absent publicly", () => {
  const { mocks } = harness("ADMIN");
  const Sidebar = load("src/components/admin/AdminSidebar.tsx", mocks).default;
  const sidebar = renderToStaticMarkup(React.createElement(Sidebar, {}));
  assert.match(sidebar, /Comms &amp; media/);
  assert.match(sidebar, /href="\/admin\/matchweek-reports"/);
  assert.match(sidebar, /Private previews/);
  const Header = load("src/components/layout/AppHeader.tsx", mocks).default;
  const admin = renderToStaticMarkup(React.createElement(Header, { variant: "admin" }));
  assert.equal((admin.match(/href="\/admin\/matchweek-reports"/g) || []).length, 2, "desktop and mobile menus both contain the link");
  const publicHeader = renderToStaticMarkup(React.createElement(Header, { variant: "public" }));
  assert.doesNotMatch(publicHeader, /matchweek-reports|weekly-report/);
  const QuickLinks = load("src/components/leagues/LeagueQuickLinks.tsx", mocks).default;
  const publicNav = renderToStaticMarkup(React.createElement(QuickLinks, { slug: "example" }));
  assert.doesNotMatch(publicNav, /Matchweek|weekly-report|matchweek-reports/);
  for (const label of ["League table", "Fixtures", "Results", "Stats"]) assert.ok(publicNav.includes(label));
});

test("negative control detects removal of the page-level admin guard", async () => {
  const { state, mocks } = harness();
  const unguarded = load(indexPath, mocks, (source) => source.replace("await requireAdmin();", ""));
  await unguarded.default();
  assert.throws(() => assert.equal(state.queries.length, 0), assert.AssertionError);
});

test("repository-wide scan finds no alternate public report links or implementation", () => {
  const matches = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:[cm]?[jt]sx?)$/.test(file)) {
        const source = read(file);
        if (!/weekly-report|matchweek.?report/i.test(source)) continue;
        matches.push(file);
        const publiclyReachable = file.startsWith("src/app/(public)/") || file.startsWith("src/app/captain/") || file.startsWith("src/app/player/") || file.startsWith("src/components/leagues/");
        if (publiclyReachable) assert.equal(file, legacyPath, `Unexpected report exposure in ${file}`);
      }
    }
  }
  visit("src");
  console.log("Report reference audit:", matches.join(", "));
  assert.doesNotMatch(read(legacyPath), /prisma|teamMetadata|homeScore|awayScore/);
  assert.ok(matches.includes(indexPath));
  assert.ok(matches.includes(detailPath));
});
