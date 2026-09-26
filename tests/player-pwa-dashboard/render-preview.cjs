const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { chromium } = require(process.env.PLAYER_ORDER_PLAYWRIGHT || "playwright");

const h = React.createElement;
const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function load(file, mocks) {
  const source = read(file);
  const code = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === "react" || id === "react/jsx-runtime") return require(id);
    throw Error(`Unexpected dependency ${id} in ${file}`);
  }, mod, mod.exports);
  return mod.exports.default;
}

const Link = ({ children, ...props }) => h("a", props, children);
const Icon = (props) => h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", ...props },
  h("circle", { cx: 12, cy: 12, r: 8, strokeWidth: 1.8 }));
const outline = {
  BanknotesIcon: Icon,
  CalendarDaysIcon: Icon,
  ChartBarSquareIcon: Icon,
  ChatBubbleLeftRightIcon: Icon,
  CheckCircleIcon: Icon,
  NewspaperIcon: Icon,
  ChevronRightIcon: Icon,
  EllipsisHorizontalCircleIcon: Icon,
  HomeIcon: Icon,
  UserCircleIcon: Icon,
};
const solid = { UserCircleIcon: Icon };
const navigation = {
  usePathname: () => "/player/team/example-team",
  useSearchParams: () => new URLSearchParams("previewMembershipId=example-membership&pwaPreview=1"),
};

function svgData(label, fill, text = "#ffffff") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><path d="M40 3 70 15v22c0 20-13 33-30 40C23 70 10 57 10 37V15L40 3Z" fill="${fill}"/><text x="40" y="45" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="${text}">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const logoData = (() => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><text x="0" y="31" font-family="Arial" font-size="30" font-weight="900" font-style="italic" fill="white">SIXFL</text></svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();

const NextImage = ({ src, alt, ...props }) => h("img", {
  ...props,
  alt,
  src: typeof src === "string" && src.startsWith("/") ? logoData : src,
});

const Home = load("src/components/player/PlayerAppHome.tsx", {
  "next/link": Link,
  "@heroicons/react/24/outline": outline,
});
const Header = load("src/components/player/PlayerPwaPortalHeader.tsx", {
  "next/image": { __esModule: true, default: NextImage },
  "next/link": Link,
  "next/navigation": navigation,
  "@heroicons/react/24/solid": solid,
});
const Nav = load("src/components/player/PlayerTeamNav.tsx", {
  "next/link": Link,
  "next/navigation": navigation,
  "@heroicons/react/24/outline": outline,
});

const teamBadge = svgData("TF", "#0f766e");
const badges = [
  svgData("RL", "#2563eb"),
  svgData("MU", "#dc2626"),
  svgData("BL", "#7c3aed"),
  svgData("LL", "#ca8a04"),
  svgData("TT", "#0891b2"),
];

const homeMarkup = renderToStaticMarkup(h(Home, {
  teamId: "example-team",
  teamName: "Thirsk Town Frazzles",
  teamLogoUrl: teamBadge,
  playerName: "Finley Bowes",
  playerImageUrl: null,
  playerRoleLabel: "Player",
  squadNumber: 7,
  preferredPosition: "Midfielder",
  stats: { appearances: 11, goals: 7, assists: 5 },
  nextFixture: {
    id: "fixture-1",
    dateLabel: "Tue, 29 Sep 2026",
    timeLabel: "8:00 pm",
    venueLabel: "Thirsk School & Sixth Form College · Pitch 1",
    homeTeam: { name: "Thirsk Town Frazzles", logoUrl: teamBadge },
    awayTeam: { name: "Richmond Legends", logoUrl: badges[0] },
  },
  nextAvailability: "AVAILABLE",
  outstandingPence: 500,
  nextPaymentUrl: null,
  recentResults: [
    { id: "r1", opponent: "Richmond Legends", opponentLogoUrl: badges[0], dateLabel: "22 Sep", goalsFor: 4, goalsAgainst: 2, outcome: "W" },
    { id: "r2", opponent: "Mush United", opponentLogoUrl: badges[1], dateLabel: "15 Sep", goalsFor: 2, goalsAgainst: 2, outcome: "D" },
    { id: "r3", opponent: "Ballerz", opponentLogoUrl: badges[2], dateLabel: "8 Sep", goalsFor: 1, goalsAgainst: 3, outcome: "L" },
    { id: "r4", opponent: "Last Legs", opponentLogoUrl: badges[3], dateLabel: "1 Sep", goalsFor: 5, goalsAgainst: 1, outcome: "W" },
    { id: "r5", opponent: "Timmy Time", opponentLogoUrl: badges[4], dateLabel: "25 Aug", goalsFor: 3, goalsAgainst: 2, outcome: "W" },
  ],
  nextSelectionStatus: "SELECTED",
  unreadChatCount: 3,
  previewMembershipId: "example-membership",
}));

const headerMarkup = renderToStaticMarkup(h(Header, {
  teamId: "example-team",
  teamName: "Thirsk Town Frazzles",
  teamLogoUrl: teamBadge,
  playerName: null,
  previewPlayers: [
    { id: "example-membership", name: "Finley Bowes" },
  ],
}));
const navMarkup = renderToStaticMarkup(h(Nav, {
  teamId: "example-team",
  unreadChatCount: 3,
  showTeamChat: false,
}));

const Newsletter = load("src/components/player/PlayerNewsArticle.tsx", {
  "@/components/news/NewsArticle": { newsDate: value => value },
  "@/components/news/NewsImage": ({ alt, className }) => h("span", { className, "aria-label": alt }, "FC"),
});
const newsletterMarkup = renderToStaticMarkup(h(Newsletter, {
  teamId: "example-team",
  news: {
    article: {
      title: "A dramatic night of football in Harrogate",
      leagueName: "Harrogate Tuesday Men's", matchDate: "2026-09-22", cover: null,
      introduction: "All the stories from another exciting night.", closing: "See you next week.",
      matches: [{ fixtureId: "fixture", teamAId: "example-team", teamBId: "other", teamA: "Thirsk Town Frazzles", teamB: "Harrogate Naija Isolo FC", badgeA: null, badgeB: null, scoreA: 12, scoreB: 11, paragraph: "A close match with a late winner.", scorers: [{ name: "Alex Example", team: "Thirsk Town Frazzles", goals: 3 }], playersOfMatch: [{ name: "Sam Example", team: "Harrogate Naija Isolo FC" }] }],
    },
  },
}));

(async () => {
  const out = path.join(root, ".tmp/player-dashboard-order");
  fs.mkdirSync(out, { recursive: true });
  const cssFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".css")) cssFiles.push(file);
    }
  };
  walk(path.join(root, ".next/static"));
  const css = cssFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="bg-[#07130f] text-white"><div class="player-pwa-mode"></div>${headerMarkup}${homeMarkup}${navMarkup}</body></html>`);
    await page.waitForTimeout(100);
    const text = await page.locator("body").innerText();
    assert.match(text, /Finley Bowes/);
    assert.match(text, /Player Portal · Thirsk Town Frazzles/);
    assert.match(text, /SELECTED/);
    assert.match(text, /3 unread messages/);
    assert.match(text, /Thirsk School/);
    assert.match(text, /£5\.00 outstanding/);
    assert.match(text, /League newsletters/);
    assert.match(await page.getByRole("link", { name: /League newsletters/ }).getAttribute("href"), /\/player\/team\/example-team\/news\?previewMembershipId=/);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= 391, "Rendered Player PWA Home must not overflow horizontally");
    await page.screenshot({ path: path.join(out, "PLAYER-HOME-390.png"), fullPage: false });
    for (const viewportWidth of [320, 390]) {
      await page.setViewportSize({ width: viewportWidth, height: 852 });
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="bg-[#07130f] text-white"><main class="mx-auto max-w-xl px-3 py-4">${newsletterMarkup}</main></body></html>`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= viewportWidth + 1, "Newsletter reader must not overflow horizontally");
      assert.match(await page.locator("body").innerText(), /A close match with a late winner/);
      assert.equal(await page.locator("a").count(), 0, "Article content must not link out to website pages");
      await page.screenshot({ path: path.join(out, `PLAYER-NEWSLETTER-${viewportWidth}.png`), fullPage: true });
    }
    await page.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
