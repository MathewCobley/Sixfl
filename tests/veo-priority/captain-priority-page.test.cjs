const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const layout = fs.readFileSync("src/app/captain/team/[teamid]/layout.tsx", "utf8");
const page = fs.readFileSync("src/app/captain/team/[teamid]/veo-priority/page.tsx", "utf8");

test("captain League & media navigation links to a real Priority score page", () => {
  assert.match(layout, /href: `\/captain\/team\/\$\{teamid\}\/veo-priority`/);
  assert.match(layout, /label: "Priority score"/);
  assert.match(layout, /Open SIXFL TV Priority Score/);
});

test("Priority score page explains the single 100-point model clearly", () => {
  assert.match(page, /Priority Score/);
  assert.match(page, /one score SIXFL uses when deciding which eligible matches get recording priority/);
  assert.match(page, /reliability contributes up to 80 points/);
  assert.match(page, /audience up to 10/);
  assert.match(page, /goal-award\s+participation up to 10/);
  assert.match(page, /View index across all measured SIXFL TV matches/);
  assert.match(page, /CaptainVeoPriorityCard/);
});
