import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as searchModule from "../src/lib/players/prospect-search.ts";

// tsx loads .ts files as CommonJS in this repository; Node exposes that object
// as the default export when this ESM test imports it. Production uses Next.js.
const search = searchModule.default ?? searchModule;
const { normaliseProspectSearch, createProspectSearchMatcher } = search;
assert.equal(typeof normaliseProspectSearch, "function");
assert.equal(typeof createProspectSearchMatcher, "function");
const sample = { firstName: "Gaël", lastName: "Example", email: "gael+football@example.test", phone: "+44 (0)7700 900123" };
for (const query of ["gael", "GAËL", "example gael", "  Gael    Example ", "gael+football@", "EXAMPLE.TEST", "07700900123", "+44 7700 900123", "0044 7700 900123", "07700 900 123", "900123", "gael 900123"]) {
  test(`matches name/email/mobile: ${JSON.stringify(query)}`, () => {
    assert.equal(createProspectSearchMatcher(query)(sample), true);
  });
}
test("blank and repeated queries are normalised safely", () => {
  for (const query of [undefined, null, 123, {}, "  "]) assert.equal(normaliseProspectSearch(query), "");
  assert.equal(normaliseProspectSearch(["  gael  example  ", "ignored"]), "gael example");
  assert.equal(normaliseProspectSearch("x".repeat(1000)).length, 120);
  assert.equal(createProspectSearchMatcher(" ")({ firstName: null, lastName: null, email: null, phone: null }), true);
});
test("literal punctuation, nonmatches and empty contacts do not match every record", () => {
  for (const query of ["zzzz", "%", "_", ".*", "[", "'", "gael missing", "999999999"]) {
    assert.equal(createProspectSearchMatcher(query)(sample), false, query);
  }
  assert.equal(createProspectSearchMatcher("someone")({ firstName: null, lastName: null, email: null, phone: null }), false);
  assert.equal(createProspectSearchMatcher("oneill")({ ...sample, lastName: "O’Neill" }), true);
});
test("UK phone search works in both directions without matching scattered groups", () => {
  assert.equal(createProspectSearchMatcher("+44 7700 900123")({ ...sample, phone: "07700-900123" }), true);
  assert.equal(createProspectSearchMatcher("00447700900123")({ ...sample, phone: "07700900123" }), true);
  assert.equal(createProspectSearchMatcher("123 900")({ ...sample, phone: "07700900123" }), false);
});

// Execute the actual prepared server page, not a second implementation of its
// filtering/pagination. Only data, auth and unrelated card widgets are mocked.
const require = createRequire(import.meta.url);
const pagePath = path.resolve("src/app/(admin)/admin/player-prospects/page.tsx");
const pageSource = fs.readFileSync(pagePath, "utf8");
const emitted = ts.transpileModule(pageSource, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const leagueA = { id: "league-a", name: "North Example", season: "2026", area: "North", dayOfWeek: "MONDAY" };
const leagueB = { id: "league-b", name: "South Example", season: "2026", area: "South", dayOfWeek: "TUESDAY" };
const teamA = { id: "team-a", name: "Example Managed", teamMode: "MANAGED", league: leagueA };
const now = new Date("2026-09-01T12:00:00Z");
function prospect(id, overrides = {}) {
  return { id, teamId: null, firstName: "Test", lastName: id, email: `${id}@example.test`,
    phone: null, preferredPositions: null, availabilitySummary: null, source: null,
    status: "NEW", notes: null, createdAt: now, updatedAt: now, lastContactedAt: null, team: null, ...overrides };
}
const fixtures = [
  ...Array.from({ length: 25 }, (_, i) => prospect(`ordinary-${i}`)),
  prospect("target", { ...sample, firstName: "Gael", lastName: "Needle", notes: "Area: North" }),
  prospect("active", { firstName: "Gael", lastName: "Active", status: "ACTIVE_SQUAD", teamId: "team-a", team: teamA }),
  prospect("duplicate", { firstName: "Gael", lastName: "Duplicate", status: "DUPLICATE", notes: "Area: North" }),
  prospect("declined", { firstName: "Gael", lastName: "Declined", status: "DECLINED", notes: "Area: South" }),
  prospect("linked", { firstName: "Existing", lastName: "Member", teamId: "team-a", team: teamA }),
];
function harness({ rows = fixtures, denied = false } = {}) {
  const calls = { auth: 0, reads: 0, enrichedIds: [] };
  const mocks = {
    "@/lib/players/prospect-search": search,
    "@/lib/requireAdmin": { requireAdmin: async () => { calls.auth++; if (denied) throw new Error("ADMIN_REQUIRED"); } },
    "@/lib/prisma": { prisma: {
      teamPlayerProspect: { findMany: async () => { calls.reads++; return structuredClone(rows); } },
      team: { findMany: async () => [teamA] },
      league: { findMany: async () => [leagueA, leagueB] },
      notificationDispatch: { findMany: async (args) => { calls.enrichedIds = args.where.sourceId.in; return []; } },
      $queryRaw: async (query) => {
        const text = query.sql ?? query.strings?.join("") ?? "";
        if (text.includes('JOIN "TeamMember"')) return [{ emailNormalized: "linked@example.test", teamId: "team-a" }];
        return [];
      },
    } },
    "next/link": { __esModule: true, default: (props) => React.createElement("a", props, props.children) },
    "@/components/admin/player-prospects/ProspectNativeActions": { __esModule: true, default: () => null },
    "@/components/ui/FormListboxField": { __esModule: true, default: ({ name, options, value, label, disabled }) =>
      React.createElement("label", null, label, React.createElement("select", { name, defaultValue: value, disabled },
        options.map((option) => React.createElement("option", { key: option.value, value: option.value }, option.label)))) },
    "@/lib/datetime/london": { formatDateTimeInLondon: (date) => date.toISOString() },
    "./actions": { assignPlayerProspectToTeamAction: "/test/no-writes", sendPlayerProspectSquadInviteAction: "/test/no-writes", sendPlayerProspectYesNoChaseAction: "/test/no-writes" },
  };
  const mod = new Module(pagePath);
  mod.filename = pagePath;
  mod.paths = Module._nodeModulePaths(process.cwd());
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  mod._compile(emitted, pagePath);
  return { calls, render: async (params = {}) => renderToStaticMarkup(await mod.exports.default({ searchParams: Promise.resolve(params) })).replace(/<!--.*?-->/g, "") };
}
function cardNames(html) {
  return [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((match) => match[1]);
}
function linkParams(html, label) {
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text === label || text.startsWith(label)) return new URL(match[1].replaceAll("&amp;", "&"), "https://test.invalid").searchParams;
  }
  assert.fail(`Link not found: ${label}`);
}

test("search finds a player beyond the first twelve cards", async () => {
  const h = harness();
  const original = await h.render();
  assert.equal(cardNames(original).length, 12);
  assert.ok(!cardNames(original).includes("Gael Needle"));
  const html = await h.render({ q: "needle" });
  assert.deepEqual(cardNames(html), ["Gael Needle"]);
  assert.match(html, /Showing 1-1 of 1 matching players/);
  assert.deepEqual(h.calls.enrichedIds, ["target"]);
  assert.equal(h.calls.auth, 2);
});
test("email and formatted mobile searches render the existing player card", async () => {
  for (const q of ["GAEL+FOOTBALL@EXAMPLE.TEST", "07700 900123", "+44 7700 900123"]) {
    assert.deepEqual(cardNames(await harness().render({ q })), ["Gael Needle"]);
  }
});
test("search combines with the league filter and keeps unassigned area matches", async () => {
  assert.deepEqual(cardNames(await harness().render({ q: "gael", leagueId: "league-a" })), ["Gael Needle"]);
  const html = await harness().render({ q: "needle", leagueId: "league-b" });
  assert.deepEqual(cardNames(html), []);
  assert.match(html, /No players match this search and league filter/);
});
test("all four status tabs keep the search and show their own matched counts", async () => {
  for (const [view, name] of [["pipeline", "Gael Needle"], ["active", "Gael Active"], ["duplicates", "Gael Duplicate"], ["declined", "Gael Declined"]]) {
    const html = await harness().render({ q: "gael", view });
    assert.deepEqual(cardNames(html), [name]);
    assert.match(html, /4 across all status tabs/);
    for (const label of ["Open pipeline", "Active players", "Duplicates", "Not interested"]) {
      const params = linkParams(html, label);
      assert.equal(params.get("q"), "gael");
      assert.equal(params.has("page"), false);
    }
  }
});
test("existing linked-member classification remains active rather than assignable", async () => {
  assert.deepEqual(cardNames(await harness().render({ q: "Existing" })), []);
  assert.deepEqual(cardNames(await harness().render({ q: "Existing", view: "active" })), ["Existing Member"]);
});
test("query and league survive next/previous while new searches reset pagination", async () => {
  const rows = Array.from({ length: 30 }, (_, i) => prospect(`match-${i}`, { notes: "Area: North" }));
  const h = harness({ rows });
  const html = await h.render({ q: "test", page: "2", leagueId: "league-a" });
  assert.equal(cardNames(html).length, 12);
  assert.match(html, /Showing 13-24 of 30 matching players/);
  for (const [label, page] of [["Previous", "1"], ["Next", "3"]]) {
    const params = linkParams(html, label);
    assert.equal(params.get("q"), "test");
    assert.equal(params.get("leagueId"), "league-a");
    assert.equal(params.get("page") ?? "1", page);
  }
  const form = html.match(/<form[^>]*role="search"[\s\S]*?<\/form>/)?.[0];
  assert.ok(form);
  assert.match(form, /method="get"/);
  assert.match(form, /name="q"/);
  assert.match(form, /name="view"/);
  assert.match(form, /name="leagueId"/);
  assert.ok(!form.includes('name="page"'));
  assert.match(form, /type="submit"/);
});
test("clear search retains league and status; clear league retains search", async () => {
  const html = await harness().render({ q: "Gael+football@", leagueId: "league-a", view: "active" });
  const clearSearch = linkParams(html, "Clear search");
  assert.equal(clearSearch.get("leagueId"), "league-a");
  assert.equal(clearSearch.get("view"), "active");
  assert.equal(clearSearch.has("q"), false);
  assert.equal(clearSearch.has("page"), false);
  const clearLeague = linkParams(html, "Clear league");
  assert.equal(clearLeague.get("q"), "Gael+football@");
  assert.equal(clearLeague.get("view"), "active");
  assert.equal(clearLeague.has("leagueId"), false);
});
test("empty current status points to other matches; old page numbers clamp safely", async () => {
  const html = await harness().render({ q: "Active", page: "999" });
  assert.deepEqual(cardNames(html), []);
  assert.match(html, /Check the other status tabs/);
  assert.match(html, /Showing 0-0 of 0 matching players/);
  assert.deepEqual(cardNames(await harness().render({ q: "needle", page: "999" })), ["Gael Needle"]);
});
test("search text is escaped and repeat/empty parameters do not crash", async () => {
  const html = await harness().render({ q: '<script>alert("x")</script>' });
  assert.ok(!html.includes('<script>alert("x")</script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.deepEqual(cardNames(await harness().render({ q: ["needle", "other"] })), ["Gael Needle"]);
  assert.equal(cardNames(await harness().render({ q: "   " })).length, 12);
});
test("admin access is still required before loading the prospect directory", async () => {
  const h = harness({ denied: true });
  await assert.rejects(h.render({ q: "needle" }), /ADMIN_REQUIRED/);
  assert.equal(h.calls.reads, 0);
});
