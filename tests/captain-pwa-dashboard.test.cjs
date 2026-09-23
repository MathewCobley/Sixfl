const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("captain PWA home is a dedicated app dashboard while web overview remains intact", () => {
  const page = read("src/app/captain/team/[teamid]/page.tsx");
  const home = read("src/components/captain/CaptainAppHome.tsx");

  assert.match(page, /<CaptainPwaModeOnly mode="app">/);
  assert.match(page, /<CaptainAppHome/);
  assert.match(page, /<CaptainPwaModeOnly mode="web">/);
  assert.match(page, /CaptainVeoPriorityCard/);

  assert.match(home, /Your team/);
  assert.match(home, /Next match/);
  assert.match(home, /Needs attention/);
  assert.match(home, /Quick actions/);
  assert.match(home, /Confirm your fixture/);
  assert.match(home, /Finish match reports/);
  assert.match(home, /Team payment due/);
  assert.match(home, /PlayerPool/);
  assert.match(home, /SIXFL TV/);
});

test("captain PWA has a native header and five primary tabs", () => {
  const layout = read("src/app/captain/team/[teamid]/layout.tsx");
  const nav = read("src/components/captain/CaptainPwaBottomNav.tsx");

  assert.match(layout, /<CaptainPwaModeOnly mode="app">[\s\S]*SIXFL captain home/);
  assert.match(layout, /<CaptainPwaModeOnly mode="web">[\s\S]*captain-team-header/);
  assert.match(layout, /unreadMessageCount=\{unreadMessageCount\}/);

  for (const label of ["Home", "Fixtures", "Squad", "Payments", "Inbox"]) {
    assert.match(nav, new RegExp(`label: "${label}"`));
  }
  assert.match(nav, /grid-cols-5/);
  assert.match(nav, /ChatBubbleLeftRightIcon/);
});

test("captain app mode works in installed PWA and admin phone preview", () => {
  const mode = read("src/components/captain/CaptainPwaModeOnly.tsx");

  assert.match(mode, /display-mode: standalone/);
  assert.match(mode, /navigator/);
  assert.match(mode, /window\.parent\.location\.pathname === "\/admin\/pwa"/);
  assert.match(mode, /pwaPreview/);
});
