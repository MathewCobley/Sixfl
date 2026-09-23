const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (id) => (id in mocks ? mocks[id] : require(id)),
    mod,
    mod.exports,
  );
  return mod.exports;
}
const Link = ({ children, ...props }) =>
  React.createElement("a", props, children);
const Home = load("src/components/referee/RefereeAppHome.tsx", {
  "next/link": Link,
}).default;
const base = {
  name: "Charlie Cobley",
  openCount: 2,
  submittedCount: 1,
  dueToYou: "£30.00",
  dueToSixfl: "£10.00",
  confirmation: null,
  children: null,
  preview: null,
  desktopTabs: null,
  nextNight: {
    id: "n1",
    leagueName: "Northallerton Monday",
    venueName: "Test venue",
    dateLabel: "28 September",
    fixtureCount: 4,
    feeLabel: "£40.00",
    isPast: false,
    isToday: false,
    firstKickoff: "19:30",
    colleagues: "Refereeing with: Mathew.",
  },
};
test("home exposes real night details and operational routes without website escape links", () => {
  const html = renderToStaticMarkup(React.createElement(Home, base));
  for (const text of [
    "Hi, Charlie",
    "19:30",
    "Test venue",
    "£40.00",
    "£30.00",
    "£10.00",
    "Refereeing with: Mathew.",
    "View match night",
  ])
    assert.ok(html.includes(text), text);
  for (const href of [...html.matchAll(/<a[^>]*href="([^"]*)"/g)].map(
    (m) => m[1],
  ))
    assert.ok(href.startsWith("/referee") || href.startsWith("#"), href);
  assert.match(html, /aria-label="Referee app navigation"/);
});
test("empty and overdue states are explicit and retain useful actions", () => {
  const empty = renderToStaticMarkup(
    React.createElement(Home, { ...base, nextNight: null }),
  );
  assert.match(empty, /No night assigned yet/);
  assert.doesNotMatch(empty, /View match night|Run match night|Complete match night/);
  assert.match(empty, /Mark your dates/);
  assert.match(
    renderToStaticMarkup(
      React.createElement(Home, {
        ...base,
        nextNight: { ...base.nextNight, isPast: true },
      }),
    ),
    /Night needs completing/,
  );
});
test("confirmation retains the existing action, referee scope, and correct controls for all states", async () => {
  let status = "PENDING";
  const action = async () => {};
  const Confirmation = load(
    "src/components/referee/RefereeNightConfirmation.tsx",
    {
      "@/lib/prisma": {
        prisma: {
          $queryRaw: async (sql) => {
            assert.deepEqual(sql.values, ["ref"]);
            return [
              {
                id: "n1",
                nightDate: "2026-09-28",
                leagueName: "Test league",
                confirmationStatus: status,
              },
            ];
          },
        },
      },
      "@/lib/referee-night-confirmations": {
        ensureRefereeNightConfirmationColumns: async () => {},
      },
      "@/lib/referee-nights": { formatNightDate: () => "28 September" },
      "@/app/(public)/referee/confirmation-actions": {
        respondToRefereeNightAction: action,
      },
    },
  ).default;
  for (const expected of [
    ["PENDING", 2],
    ["CONFIRMED", 1],
    ["DECLINED", 1],
  ]) {
    status = expected[0];
    const tree = await Confirmation({ refereeId: "ref" });
    const forms = [];
    function walk(node) {
      if (!React.isValidElement(node)) return;
      if (node.type === "form") forms.push(node);
      React.Children.forEach(node.props.children, walk);
    }
    walk(tree);
    assert.equal(forms.length, expected[1]);
    for (const form of forms) assert.equal(form.props.action, action);
    const html = renderToStaticMarkup(tree);
    assert.match(html, /name="refereeNightId" value="n1"/);
    if (status === "CONFIRMED") {
      assert.match(html, /Night confirmed/);
      assert.doesNotMatch(html, /value="yes"/);
    }
    if (status === "DECLINED") {
      assert.match(html, /value="yes"/);
      assert.doesNotMatch(html, /value="no"/);
    }
  }
});
test("prepared page prioritises upcoming work, retains overdue sheets, and excludes settled balances", async () => {
  let props;
  const night = (id, nightDate, status, dueToRefereePence, extra = {}) => ({
    id,
    nightDate,
    status,
    dueToRefereePence,
    dueToSixflPence: 0,
    fixtureCount: 2,
    feePence: 4000,
    leagueName: "Test league",
    refereeId: "ref",
    submittedAt: null,
    approvedAt: null,
    settledAt: null,
    ...extra,
  });
  const Page = load("src/app/(public)/referee/page.tsx", {
    "next/link": Link,
    "next/navigation": {
      redirect: () => {
        throw Error("Unexpected redirect");
      },
    },
    "@/components/referee/RefereeAppHome": (p) => {
      props = p;
      return null;
    },
    "@/components/referee/RefereePortalViewMode": ({ children }) => children,
    "@/components/referee/RefereeNightConfirmation": () => null,
    "@/components/referee/RefereeTabs": () => null,
    "@/lib/admin": {
      requireReferee: async () => ({
        user: { id: "ref", name: "Charlie" },
        authenticatedUser: { role: "REFEREE" },
        isAdminPreview: false,
      }),
    },
    "@/lib/prisma": { prisma: { $queryRaw: async () => [] } },
    "@/lib/datetime/london": {
      toLondonDateInputValue: () => "2026-09-23",
      formatDateTimeInLondon: () => "19:30",
    },
    "@/lib/referee-nights": {
      formatMoney: (p) => `£${(p / 100).toFixed(2)}`,
      formatNightDate: (x) => x,
      isRefereeNightPayable: (night, today) =>
        night.status !== "CANCELLED" && night.nightDate < today,
      getRefereePayableDueToRefereePence: (night, today) =>
        night.status !== "CANCELLED" &&
        night.status !== "SETTLED" &&
        night.nightDate < today
          ? Math.max(
              0,
              (night.dueToRefereePence ?? 0) -
                (night.cashPaidToRefereePence ?? 0),
            )
          : 0,
      getRefereePayableDueToSixflPence: (night, today) =>
        night.status !== "CANCELLED" &&
        night.status !== "SETTLED" &&
        night.nightDate < today
          ? Math.max(
              0,
              (night.dueToSixflPence ?? 0) -
                (night.cashReceivedFromRefereePence ?? 0),
            )
          : 0,
      getRefereeNightFixtures: async (id) => {
        assert.equal(id, "next");
        return [{ kickoffAt: new Date() }];
      },
      getRefereeNightSummaries: async () => [
        night("overdue", "2026-09-22", "DRAFT", 2000),
        night("next", "2026-09-28", "DRAFT", 4000),
        night("settled", "2026-09-20", "SETTLED", 5000),
        night("submitted", "2026-09-21", "SUBMITTED", 1000),
        night("future-submitted", "2026-09-29", "SUBMITTED", 9000, { submittedAt: new Date("2026-09-22T20:00:00Z") }),
        night("same-day-submitted", "2026-09-23", "SUBMITTED", 7000, { submittedAt: new Date("2026-09-23T22:00:00Z") }),
      ],
    },
  }).default;
  const tree = await Page();
  const appMode = React.Children.toArray(tree.props.children)[0];
  const appHome = appMode.props.children;
  appHome.type(appHome.props);
  assert.equal(props.nextNight.id, "next");
  assert.equal(props.openCount, 2);
  assert.equal(props.dueToYou, "£30.00", "only past unpaid referee nights count as owed");
  const page = fs.readFileSync("src/app/(public)/referee/page.tsx", "utf8");
  assert.match(page, /RefereePortalViewMode mode="app"/);
  assert.match(page, /RefereePortalViewMode mode="web"/);
  assert.match(page, /isRefereeNightPayable/);
  assert.match(page, /getRefereePayableDueToRefereePence/);
  assert.match(page, /getRefereePayableDueToSixflPence/);
  assert.match(page, /Open reopened night/);
  assert.match(page, /onsiteByNightId/);
  assert.doesNotMatch(
    fs.readFileSync("src/components/RouteScopedBridges.tsx", "utf8"),
    /ReopenedNightAccessBridge/,
  );
});
test("all referee work pages use the app shell and future balances are clearly not due", () => {
  const files = {
    availability: fs.readFileSync("src/app/(public)/referee/availability/page.tsx", "utf8"),
    rules: fs.readFileSync("src/app/(public)/referee/match-rules/page.tsx", "utf8"),
    nights: fs.readFileSync("src/app/(public)/referee/nights/page.tsx", "utf8"),
    night: fs.readFileSync("src/app/(public)/referee/night/[id]/page.tsx", "utf8"),
    fixture: fs.readFileSync("src/app/(public)/referee/fixture/[id]/page.tsx", "utf8"),
    ledger: fs.readFileSync("src/app/(public)/referee/ledger/page.tsx", "utf8"),
    home: fs.readFileSync("src/app/(public)/referee/page.tsx", "utf8"),
  };
  for (const [name, source] of Object.entries(files)) {
    if (name === "home") continue;
    assert.match(source, /RefereeAppShell/, name);
  }
  assert.match(files.availability, /active="availability"/);
  assert.match(files.rules, /active="rules"/);
  assert.match(files.nights, /active="nights"/);
  assert.match(files.night, /active="nights"/);
  assert.match(files.fixture, /active="nights"/);
  assert.match(files.ledger, /active="ledger"/);
  assert.doesNotMatch(files.night, /← Referee dashboard/);
  assert.doesNotMatch(files.fixture, /Back to referee dashboard|>Cancel</);
  assert.match(files.home, /Due now/);
  assert.match(files.home, /Earns after night/);
  assert.match(files.night, /Due to you now/);
  assert.match(files.night, /No referee balance is due until after this night has taken place/);
  assert.doesNotMatch(files.availability, /Save availability|Admin preview/);
  assert.doesNotMatch(files.rules, /Admin preview|Referee preview mode/);
  assert.doesNotMatch(files.night, /Admin preview|Referee preview mode/);
  assert.match(files.availability, /RefereeAvailabilityCalendar/);
  assert.match(files.ledger, /Your money/);
  assert.match(files.ledger, /Money received/);
  assert.match(files.ledger, /getRefereePayableDueToRefereePence/);
});

test("Nights is a dedicated app screen with plain-English match-night actions", () => {
  const shell = fs.readFileSync("src/components/referee/RefereeAppShell.tsx", "utf8");
  const home = fs.readFileSync("src/components/referee/RefereeAppHome.tsx", "utf8");
  const nights = fs.readFileSync("src/app/(public)/referee/nights/page.tsx", "utf8");
  assert.match(shell, /href: "\/referee\/nights"/);
  assert.match(home, /href="\/referee\/nights"/);
  assert.doesNotMatch(home, /#referee-night-picker/);
  assert.doesNotMatch(home, /Open night sheet/);
  assert.match(nights, /Complete match night/);
  assert.match(nights, /Run match night/);
  assert.match(nights, /View match night/);
  assert.match(nights, /Needs action/);
  assert.match(nights, /Previous nights/);
});

test("referee app navigation exposes a dedicated ledger tab", () => {
  const shell = fs.readFileSync("src/components/referee/RefereeAppShell.tsx", "utf8");
  const home = fs.readFileSync("src/components/referee/RefereeAppHome.tsx", "utf8");
  assert.match(shell, /href: "\/referee\/ledger"/);
  assert.match(shell, /label: "Ledger"/);
  assert.match(home, /href="\/referee\/ledger"/);
  assert.match(home, /grid-cols-5/);
});

test("availability is a calendar with usual nights highlighted and instant-save editing", () => {
  const page = fs.readFileSync("src/app/(public)/referee/availability/page.tsx", "utf8");
  const calendar = fs.readFileSync("src/components/referee/RefereeAvailabilityCalendar.tsx", "utf8");
  const actions = fs.readFileSync("src/app/(public)/referee/availability/actions.ts", "utf8");
  assert.doesNotMatch(page, /Save availability/);
  assert.match(page, /RefereeAvailabilityCalendar/);
  assert.match(calendar, /grid-cols-7/);
  assert.match(calendar, /Usual nights are highlighted/);
  assert.doesNotMatch(calendar, /Your availability/);
  assert.match(calendar, /Usual referee night/);
  assert.match(calendar, /label: "Unset"/);
  assert.doesNotMatch(calendar, /label: "No response"/);
  assert.match(calendar, /updateRefereeAvailabilitySlotAction/);
  assert.match(calendar, /onBlur=\{saveNoteIfChanged\}/);
  assert.match(actions, /export async function updateRefereeAvailabilitySlotAction/);
});

module.exports = { base };


test("decorative website-style eyebrows are removed from referee app screens", () => {
  const home = fs.readFileSync("src/components/referee/RefereeAppHome.tsx", "utf8");
  const nights = fs.readFileSync("src/app/(public)/referee/nights/page.tsx", "utf8");
  const ledger = fs.readFileSync("src/app/(public)/referee/ledger/page.tsx", "utf8");
  const rules = fs.readFileSync("src/app/(public)/referee/match-rules/page.tsx", "utf8");
  const night = fs.readFileSync("src/app/(public)/referee/night/[id]/page.tsx", "utf8");
  const refereePage = fs.readFileSync("src/app/(public)/referee/page.tsx", "utf8");

  assert.doesNotMatch(home, /Referee Portal|Ready for match night/);
  assert.match(home, />\s*Home\s*</);
  assert.doesNotMatch(nights, />\s*Match nights\s*</);
  assert.doesNotMatch(ledger, />\s*Payment history\s*</);
  assert.doesNotMatch(rules, />\s*Quick reference\s*</);
  assert.match(night, /title="Match night"/);
  assert.doesNotMatch(night, /title="Night sheet"/);
  assert.doesNotMatch(refereePage, />\s*Night sheets\s*</);
  assert.doesNotMatch(refereePage, /No open night sheets\./);
});
