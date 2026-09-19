const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const overview = fs.readFileSync("src/app/(admin)/admin/page.tsx", "utf8");
const activity = fs.readFileSync("src/lib/admin/latest-activity.ts", "utf8");

test("admin overview shows the five newest external actions", () => {
  assert.match(overview, /Latest activity/);
  assert.match(overview, /getAdminLatestActivity\(5\)/);
  assert.match(overview, /Newest first/);
  assert.match(overview, /captains, players, leads, payers and other external users/);
  assert.match(overview, /formatRelativeActivityTime/);
});

test("latest activity covers the main external SIXFL workflows", () => {
  for (const source of [
    "Message received from",
    "payment received from",
    "player match fee",
    "confirmed their fixture",
    "raised a fixture issue",
    "completed a poll",
    "registered cup interest",
    "declined the cup invitation",
    "Result submitted:",
    "raised a result dispute",
  ]) {
    assert.ok(activity.includes(source), "missing activity source: " + source);
  }

  assert.match(activity, /direction: "INBOUND"/);
  assert.match(activity, /SIXFLPollRecipient/);
  assert.match(activity, /CupInvitation/);
  assert.match(activity, /paymentTransaction/);
  assert.match(activity, /playerMatchFee/);
  assert.match(activity, /fixtureCaptainConfirmation/);
  assert.match(activity, /matchResult/);
  assert.match(activity, /resultDispute/);
  assert.match(activity, /role === "ADMIN"/);
});

test("activity rows link back to useful admin screens", () => {
  assert.match(activity, /\/admin\/messages\?filter=all&thread=/);
  assert.match(activity, /\/admin\/leads/);
  assert.match(activity, /\/admin\/payments\?teamId=/);
  assert.match(activity, /\/admin\/fixtures/);
  assert.match(activity, /\/admin\/polls\//);
  assert.match(activity, /\/admin\/cups\//);
  assert.match(activity, /\/admin\/results/);
});
