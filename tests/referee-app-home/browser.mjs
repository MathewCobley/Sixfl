import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";
const output = "/tmp/sixfl-referee-home-browser";
fs.mkdirSync(output, { recursive: true });
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import Home from './src/components/referee/RefereeAppHome';
import Confirmation from './src/components/referee/RefereeNightConfirmation';
window.submissions=[];
(async()=>{const confirmation=await Confirmation({refereeId:'ref'});createRoot(document.getElementById('root')).render(<Home name="Charlie Cobley" openCount={2} submittedCount={1} dueToYou="£30.00" dueToSixfl="£10.00" confirmation={confirmation} preview={null} desktopTabs={null}
nextNight={{id:'n1',leagueName:'Northallerton Monday',venueName:'Northallerton Sports Village',dateLabel:'Mon 28 September',fixtureCount:4,feeLabel:'£40.00',isPast:false,isToday:false,firstKickoff:'19:30',colleagues:'Refereeing with: Mathew.'}}>
<section id="referee-night-picker" className="rounded-2xl border border-white/10 p-4"><h2>Choose the night you want to work on</h2></section><section id="referee-ledger">Money owed and paid</section></Home>);})();`;
const mocks = {
  "next/link": `import React from 'react';export default function Link(props){return <a {...props}/>;}`,
  "@prisma/client": "export const Prisma={sql:()=>({})};",
  "@/lib/prisma": `export const prisma={$queryRaw:async()=>[{id:'n1',nightDate:'2026-09-28',confirmationStatus:'PENDING',leagueName:'Northallerton Monday',venueName:'Northallerton Sports Village'}]};`,
  "@/lib/referee-night-confirmations":
    "export async function ensureRefereeNightConfirmationColumns(){}",
  "@/lib/referee-nights": `export const formatNightDate=()=> 'Mon 28 September';`,
  "@/app/(public)/referee/confirmation-actions": `export async function respondToRefereeNightAction(form){window.submissions.push(Object.fromEntries(form));}`,
};
await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() },
  bundle: true,
  outfile: path.join(output, "app.js"),
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  plugins: [
    {
      name: "referee-fixture",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) =>
          Object.hasOwn(mocks, args.path)
            ? { path: args.path, namespace: "mock" }
            : null,
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents: mocks[args.path],
          loader: "tsx",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const css = await postcss([tailwind()]).process('@import "tailwindcss";', {
  from: path.resolve("referee-browser.css"),
});
fs.writeFileSync(path.join(output, "style.css"), css.css);
const server = createServer((req, res) => {
  if (req.url === "/logo2.png") {
    res.setHeader("Content-Type", "image/png");
    res.end(fs.readFileSync("public/logo2.png"));
    return;
  }
  const file = { "/app.js": "app.js", "/style.css": "style.css" }[req.url];
  res.setHeader(
    "Content-Type",
    file
      ? file.endsWith(".js")
        ? "text/javascript"
        : "text/css"
      : "text/html",
  );
  res.end(
    file
      ? fs.readFileSync(path.join(output, file))
      : '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>body{margin:0;font-family:Arial,sans-serif;background:#07130f}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
  );
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: process.env.CHROMIUM_EXECUTABLE
    ? [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--disable-gpu",
      ]
    : [],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole("heading", { name: "Hi, Charlie" }).waitFor();
    assert.equal(await page.getByText("Referee Portal", { exact: true }).count(), 1);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Horizontal overflow",
    );
    const open = page.getByRole("link", { name: "Open night sheet" });
    assert.equal(await open.getAttribute("href"), "/referee/night/n1");
    const box = await open.boundingBox();
    assert.ok(box.height >= 44);
    if (width < 640)
      assert.ok(
        box.y + box.height < 760,
        "Primary action is below first screen",
      );
    await page.getByRole("button", { name: "Yes, I can referee" }).click();
    await page.waitForFunction(() => window.submissions.length === 1);
    assert.deepEqual(await page.evaluate(() => window.submissions[0]), {
      refereeNightId: "n1",
      answer: "yes",
    });
    await page
      .getByRole("button", { name: "I can’t referee", exact: true })
      .click();
    await page.waitForFunction(() => window.submissions.length === 2);
    assert.equal(await page.evaluate(() => window.submissions[1].answer), "no");
    if (width === 390)
      await page.screenshot({
        path: path.join(output, "referee-home-390.png"),
        fullPage: true,
      });
  }
  assert.deepEqual(errors, []);
  console.log(
    "Referee home passes at 320, 390, 768 and 1280px; confirmation actions and primary night link verified.",
  );
} finally {
  await browser.close();
  server.close();
}
