const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("PWA service worker falls back to a cached offline page for failed navigations", () => {
  const serviceWorker = fs.readFileSync("public/sw.js", "utf8");

  assert.match(serviceWorker, /const OFFLINE_PAGE = "\/offline\.html";/);
  assert.match(serviceWorker, /const CORE_ASSETS = \[[\s\S]*OFFLINE_PAGE/);
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
  assert.match(serviceWorker, /return await fetch\(event\.request\)/);
  assert.match(serviceWorker, /caches\.match\(OFFLINE_PAGE/);
});

test("offline screen can retry manually and recovers automatically", () => {
  const offlinePage = fs.readFileSync("public/offline.html", "utf8");

  assert.match(offlinePage, /You’re offline/);
  assert.match(offlinePage, /id="retry"/);
  assert.match(offlinePage, /addEventListener\("online"/);
  assert.match(offlinePage, /setInterval/);
  assert.match(offlinePage, /\/api\/pwa\/version\?offline-check=/);
  assert.match(offlinePage, /window\.location\.reload\(\)/);
});
