const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { renderReferralLayout } = require('./layout-fixture.cjs');

test('owning admin route separates the four-column summary from full-width decisions', async () => {
  const { html, cardCount } = await renderReferralLayout();
  assert.equal(cardCount, 4);
  for (const label of ['Not eligible', 'In progress', 'Awaiting bank details', 'Paid', 'Status: ', 'Queued', 'View recorded email']) assert.ok(html.includes(label), label);
  assert.match(html, /existing-queued-notice/);
  assert.match(html, /PRIVATE_LAYOUT_SENTINEL/); // Remains in the admin audit, not the email.
  assert.doesNotMatch(html, /lg:col-span-4|lg:grid-cols-\[1\.4fr_1\.2fr_0\.8fr_auto\]/);
});

test('summary breakpoints follow card width, not viewport or sidebar size', () => {
  const css = fs.readFileSync('src/app/(admin)/admin/referrals/referrals.css', 'utf8');
  assert.match(css, /container: sixfl-referral \/ inline-size/);
  assert.match(css, /@container sixfl-referral \(min-width: 40rem\)/);
  assert.match(css, /@container sixfl-referral \(min-width: 64rem\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /!important|@media|body|:has\(/);
});
