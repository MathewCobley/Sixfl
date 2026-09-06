const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const esbuild = require("esbuild");
const { chromium } = require(process.env.TEAM_MOVE_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
let browser, bundle;

test.before(async () => {
  const result = await esbuild.build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Control from './src/components/admin/teams/TeamMoveConfirmationSelect';
      const root=createRoot(document.getElementById('app')); window.mount=(props)=>root.render(<Control key={props.teamId} {...props}/>);`,
      loader: "tsx", resolveDir: root }, bundle: true, write: false, platform: "browser", jsx: "automatic",
    plugins: [{ name: "offline-action", setup(build) {
      build.onResolve({ filter: /^@\/app\/.*move-confirmation-actions$/ }, () => ({ path: "mock-action", namespace: "offline" }));
      build.onLoad({ filter: /.*/, namespace: "offline" }, () => ({ contents: "export const saveTeamMoveConfirmation = input => window.saveMove(input);", loader: "js" }));
      build.onResolve({ filter: /^@\// }, args => {
        const target = path.join(root, "src", args.path.slice(2));
        return { path: [target, target + ".ts", target + ".tsx"].find(p => fs.existsSync(p) && fs.statSync(p).isFile()) };
      });
    } }],
  });
  bundle = result.outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

for (const width of [1440, 390]) {
  test(`move dropdown saves and rolls back safely at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", route => route.abort());
    const page = await context.newPage();
    try {
      await page.setContent('<!doctype html><html><body style="margin:16px;background:#0b1411;color:white;font-family:Arial"><div id="app" style="max-width:360px"></div><style>*{box-sizing:border-box}select{width:100%;padding:10px}option{color:black}label{display:block}</style></body></html>');
      await page.addScriptTag({ content: bundle });
      await page.evaluate(() => {
        window.requests = [];
        window.saveMove = input => { window.requests.push(input); return new Promise((resolve, reject) => { window.completeSave=resolve; window.failSave=reject; }); };
        window.mount({teamId:"team-a", teamName:"Test team", initialStatus:"PENDING"});
      });
      const select = page.getByRole("combobox", { name: "Move confirmation for Test team" });
      await select.waitFor();
      assert.equal(await select.inputValue(), "PENDING");
      assert.equal(await select.locator("option").count(), 3);
      await select.selectOption("CONFIRMED");
      await page.waitForFunction(() => window.requests.length === 1);
      assert.equal(await select.isDisabled(), true);
      assert.match(await page.getByRole("status").textContent(), /Saving/);
      assert.deepEqual(await page.evaluate(() => window.requests[0]), { teamId: "team-a", status: "CONFIRMED", previousStatus: "PENDING" });
      await page.evaluate(() => window.completeSave({ ok:true, status:"CONFIRMED", updatedAt:"2026-09-06T12:00:00Z", updatedBy:"Test Admin" }));
      await page.waitForFunction(() => !document.querySelector("select").disabled);
      assert.equal(await select.inputValue(), "CONFIRMED");
      assert.match(await page.getByRole("status").textContent(), /Saved.*Test Admin/);
      await select.selectOption("DECLINED");
      await page.waitForFunction(() => window.requests.length === 2);
      await page.evaluate(() => window.completeSave({ ok:false, error:"Could not save the move confirmation. Please try again." }));
      await page.getByRole("alert").waitFor();
      assert.equal(await select.inputValue(), "CONFIRMED");
      assert.equal(await select.isDisabled(), false);
      assert.equal((await page.getByRole("status").textContent()).includes("Saved."), false);
      await select.selectOption("DECLINED");
      await page.waitForFunction(() => window.requests.length === 3);
      await page.evaluate(() => window.completeSave({ ok:true, status:"DECLINED", updatedAt:"2026-09-06T12:05:00Z", updatedBy:"Test Admin" }));
      await page.waitForFunction(() => !document.querySelector("select").disabled);
      assert.equal(await select.inputValue(), "DECLINED");
      // Simulate navigating away and reloading with the persisted server data.
      await page.evaluate(() => window.mount({ teamId:"other-team", teamName:"Other team", initialStatus:"PENDING" }));
      await page.getByRole("combobox", { name: "Move confirmation for Other team" }).waitFor();
      await page.evaluate(() => window.mount({ teamId:"team-a", teamName:"Test team", initialStatus:"DECLINED", initialUpdatedAt:"2026-09-06T12:05:00Z", initialUpdatedBy:"Test Admin" }));
      await select.waitFor();
      assert.equal(await select.inputValue(), "DECLINED");
      assert.match(await page.getByRole("status").textContent(), /Test Admin/);
      await select.selectOption("PENDING");
      await page.waitForFunction(() => window.requests.length === 4);
      await page.evaluate(() => window.failSave(new Error("offline")));
      await page.getByRole("alert").waitFor();
      assert.equal(await select.inputValue(), "DECLINED");
      assert.equal(await select.isDisabled(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    } finally { await context.close(); }
  });
}
