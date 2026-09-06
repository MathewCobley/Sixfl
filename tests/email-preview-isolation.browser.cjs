const test = require("node:test");
const assert = require("node:assert/strict");
const { renderPreview, load } = require("./helpers/email-preview-render.cjs");
const { chromium } = require(process.env.EMAIL_PREVIEW_PLAYWRIGHT_MODULE || "playwright");
let browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(async () => { await browser?.close(); });

const hostileEmail = `<!doctype html><html><head><style>
html, body { height:100% !important; margin:0 !important; padding:0 !important; }
body { background:rgb(255,0,0) !important; }
header, aside, section { min-height:620px !important; }
table { table-layout:fixed !important; }
</style></head><body>
<script>window.emailScriptExecuted=true;parent.document.getElementById('admin-header').remove();</script>
<p id="mail-content" style="color:rgb(12,34,56)">The stored message remains readable.</p>
<a id="normal-link" href="https://preview.example.test/read">Open sample link</a>
<a id="top-link" href="https://preview.example.test/escape" target="_top">Attempt top navigation</a>
<form action="https://preview.example.test/submit" method="post"><button id="email-submit">Submit email form</button></form>
<img src="data:image/png,broken" onerror="window.emailHandlerExecuted=true">
<div style="width:5000px">Wide email table equivalent</div>
<div style="height:2400px">Long email</div><p id="mail-end">End of stored message</p>
</body></html>`;

function harness(content) {
  return `<!doctype html><html><head><style>
  *{box-sizing:border-box}body{margin:12px;padding:8px;background:rgb(11,15,20);font:16px Arial;color:white}
  header{height:48px;min-height:0;background:#111}aside{min-height:0;background:#03261c}
  .shell{display:grid;grid-template-columns:220px minmax(0,1fr);gap:16px}.columns{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);align-items:start;gap:16px}.columns>*{min-width:0}
  section{min-height:0}iframe{display:block;width:100%;min-width:0;border:0;background:white}table{table-layout:auto;border-collapse:separate}td{padding:12px}
  @media(max-width:700px){aside{display:none}.shell{display:block}.columns{grid-template-columns:minmax(0,1fr)}}
  </style></head><body><header id="admin-header">SIXFL Admin</header><div class="shell"><aside id="admin-sidebar">League navigation</aside><main>
  <h1>League communications</h1><div class="columns"><section id="composer"><h2>Compose message</h2><label>Message<input id="compose-input"></label><button id="compose-button">Preview only</button><p id="sms">SMS plain text remains unchanged</p></section><section id="history">${content}</section></div>
  <table id="admin-table"><tr><td>Team</td><td>Status</td></tr></table></main></div></body></html>`;
}
async function newPage(width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const requests = [];
  // No SIXFL, mail, Stripe or other external server is contacted by these tests.
  await context.route("https://**/*", async route => {
    requests.push({ url: route.request().url(), method: route.request().method() });
    await route.fulfill({ status: 200, contentType: "text/html", body: "<p>Offline preview link fixture</p>" });
  });
  return { context, page: await context.newPage(), requests };
}
async function measure(page) {
  return page.evaluate(() => ({
    margin: getComputedStyle(document.body).marginTop,
    background: getComputedStyle(document.body).backgroundColor,
    header: document.getElementById("admin-header").getBoundingClientRect().height,
    table: getComputedStyle(document.getElementById("admin-table")).tableLayout,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
}

test("negative control: the actual SIXFL email CSS alters the parent when inserted directly", async () => {
  const { context, page } = await newPage();
  try {
    const { buildSIXFLEmailHtml } = load("src/lib/email/buildEmail.ts");
    const email = buildSIXFLEmailHtml({ body: "A local preview regression fixture." });
    await page.setContent(harness("<p>No preview yet</p>"));
    assert.equal((await measure(page)).margin, "12px");
    await page.setContent(harness(`<details><summary>Closed email history</summary><div>${email}</div></details>`));
    const broken = await measure(page);
    assert.equal(broken.margin, "0px");
    assert.equal(broken.table, "fixed");
    console.log("Reproduced unisolated email: body margin", broken.margin, "admin table", broken.table);
    await page.setContent(harness(renderPreview(email)));
    const fixed = await measure(page);
    assert.equal(fixed.margin, "12px");
    assert.equal(fixed.table, "auto");
    assert.equal(fixed.header, 48);
  } finally { await context.close(); }
});

for (const width of [1440, 390]) {
  test(`stored email CSS and oversize content cannot stretch the admin layout at ${width}px`, async () => {
    const { context, page } = await newPage(width);
    try {
      await page.setContent(harness(renderPreview(hostileEmail)));
      const iframe = page.locator("iframe");
      await iframe.scrollIntoViewIfNeeded();
      const frame = await (await iframe.elementHandle()).contentFrame();
      await frame.locator("#mail-content").waitFor();
      const measured = await measure(page);
      assert.equal(measured.margin, "12px");
      assert.equal(measured.background, "rgb(11, 15, 20)");
      assert.equal(measured.header, 48);
      assert.equal(measured.table, "auto");
      assert.equal(measured.overflow, false);
      const bounds = await iframe.boundingBox();
      assert.ok(bounds.height >= 256 && bounds.height <= 675);
      assert.ok(bounds.width <= width);
      assert.equal(await frame.locator("#mail-content").evaluate(el => getComputedStyle(el).color), "rgb(12, 34, 56)");
      assert.equal(await frame.evaluate(() => window.emailScriptExecuted), undefined);
      assert.equal(await frame.evaluate(() => window.emailHandlerExecuted), undefined);
      assert.equal(await frame.evaluate(() => { try { return parent.document.body.tagName; } catch (error) { return error.name; } }), "SecurityError");
      await page.evaluate(() => document.getElementById("compose-button").addEventListener("click", () => { window.previewClicked = true; }));
      await page.locator("#compose-input").fill("Preview, do not send");
      await page.locator("#compose-button").click();
      assert.equal(await page.evaluate(() => window.previewClicked), true);
      assert.equal(await page.locator("#sms").textContent(), "SMS plain text remains unchanged");
      await frame.locator("#mail-end").scrollIntoViewIfNeeded();
      assert.ok(await frame.evaluate(() => scrollY > 0));
      assert.equal((await measure(page)).header, 48);
      console.log("Isolated preview viewport", width, "header", measured.header, "frame", Math.round(bounds.width), Math.round(bounds.height));
    } finally { await context.close(); }
  });
}

test("preview links retain explicit new-tab behaviour but forms and top navigation are blocked", async () => {
  const { context, page, requests } = await newPage();
  try {
    await page.setContent(harness(renderPreview(hostileEmail)));
    const iframe = page.locator("iframe"); await iframe.scrollIntoViewIfNeeded();
    const frame = await (await iframe.elementHandle()).contentFrame();
    await frame.locator("#normal-link").waitFor();
    const popupPromise = page.waitForEvent("popup");
    await frame.locator("#normal-link").click();
    const popup = await popupPromise;
    await popup.waitForLoadState(); await popup.close();
    assert.ok(requests.some(item => item.url === "https://preview.example.test/read"));
    await frame.locator("#top-link").click();
    await frame.locator("#email-submit").click();
    await page.waitForTimeout(150);
    assert.equal(page.url(), "about:blank");
    assert.equal(requests.some(item => /escape|submit/.test(item.url)), false);
    assert.equal((await measure(page)).header, 48);
  } finally { await context.close(); }
});
