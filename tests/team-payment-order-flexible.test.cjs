const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("captain flexible payment is server-owned, oldest-first and credit-bounded", () => {
  const route = read("src/app/captain/team/[teamid]/payments/make-payment/route.ts");
  assert.match(route, /requireCaptain\(teamid\)/);
  assert.match(route, /getTeamPaymentOrder\(teamid\)/);
  assert.match(route, /if \(!order\.enabled\) return order\.ledger\.openEntries\[0\]/);
  assert.match(route, /order\.ledger\.entries\.find/);
  assert.match(route, /order\.next\?\.chargeId/);
  assert.match(route, /applyExistingTeamCreditToChargeFirst/);
  assert.match(route, /getTeamCreditPolicySnapshot/);
  assert.match(route, /getMaximumAdditionalCollectionPence/);
  assert.match(route, /requestedAmountPence > maximumPaymentPence/);
  assert.match(route, /reusableTeamChargeCheckout/);
  assert.match(route, /flexibleCaptainPayment: "1"/);
  assert.match(route, /type: "team_charge"/);
  assert.match(route, /paymentOrderPolicy: "oldest-first-v1"/);
  assert.match(route, /idempotencyKey:/);
  assert.doesNotMatch(route, /formData\.get\("chargeId"\)/);
});

test("captain payments page offers an amount field with a zero-value placeholder", () => {
  const page = read("src/app/captain/team/[teamid]/payments/page.tsx");
  assert.match(page, /Pay an amount of your choice/);
  assert.match(page, /for example £15/);
  assert.match(page, /name="amount"/);
  assert.match(page, /placeholder="0\.00"/);
  assert.match(page, /maximum payment now/);
  assert.match(page, /oldest eligible outstanding team balance first/);
  assert.match(page, /permitted surplus becomes team credit/);
});

test("flexible payments use the existing generic team-charge webhook settlement", () => {
  const webhook = read("src/app/api/stripe/webhook/route.ts");
  assert.match(webhook, /const chargeId = getChargeIdFromCheckoutSession\(session\)/);
  assert.match(webhook, /const amountPence = session\.amount_total \?\? 0/);
  assert.match(webhook, /stripeCheckoutSessionId: session\.id/);
  assert.match(webhook, /getChargeStatusFromAmounts\(charge\.amountPence, paidTotalPence\)/);
});

test("one-match-fee credit policy permits custom cash only up to outstanding plus credit headroom", () => {
  const policy = read("src/lib/payments/team-credit-policy.ts");
  assert.match(policy, /return Math\.max\(Math\.round\(input\.outstandingFixturePence\), 0\) \+ Math\.max\(Math\.round\(input\.creditHeadroomPence\), 0\)/);
});
