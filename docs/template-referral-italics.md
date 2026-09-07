# Referral-page email button and italics

In **Admin → Templates**, create or edit an email template. Under **Call to action**, enter the desired **CTA button text**, then choose **Referral page** as the **CTA destination**. The normal `{{cta}}` marker places the button in the body; without a marker, the shared email renderer uses its normal button placement.

The destination is `https://www.sixfl.co.uk/player/referrals`. It is deliberately the same safe destination for every recipient. A person signs into their own account to obtain their own referral code and sharing URL; the email does not embed an administrator's personal referral code. No account, code or referral is created while editing, previewing or sending the email.

The native **Italics** button sits beside **Bold** and **Bullet**. Select text and click it, or press **Ctrl+I / Command+I**. Clicking again removes the selected italic formatting. Without a selection, the editor inserts a selected `italic text` placeholder. The editor stores `*italic*`, `**bold**` and `***bold and italic***` markup and preserves selected list markers, indentation and blank lines. Preview and outgoing HTML use the same HTML-escaping inline renderer. Unmatched markers and raw URLs remain text; no arbitrary HTML is accepted.

## Shared implementation and scope

`src/lib/email/template-cta.ts` owns the static referral destination. The campaign/system email validators and reopen mapping recognise `referralPageUrl`. The template-driven queue resolver, announcement compatibility/resolver and generic admin lead, team, league, player/prospect composers use that same destination. `src/lib/email/inline-formatting.ts` is called by the existing shared `buildEmail.ts` renderer; `editor-formatting.ts` implements selection changes without a DOM bridge.

No marketing permissions, recipient eligibility, suppression handling, deduplication policy, templates in the live database, campaign content, customer messages, cron configuration or payment data are changed by this feature. Saving a changed announcement is still a new revision under the existing deduplication rules. SMS editing and fixed-purpose invitation/claim/fixture links are unchanged.

## Verification

The regression suite runs after the complete production preparation chain. It exercises native inline formatting, selection toggles, the shared email output, actual template/direct queued-content rendering, both email save actions with isolated storage, saved-template reopening, administrator protection, announcement compatibility and each generic composer destination. Chromium tests mount the real form and preview, test the buttons and shortcut, and isolate only the save HTTP boundary to prove saved values reopen correctly for campaign and system emails. A negative control removes italic markup and must fail the rendering tests.

The one-time branch editing aid and write-capable preparation workflow were removed before final review; neither is part of the production build. Deployment and authenticated live verification are reported separately in the PR. No customer email or SMS is sent by the tests.
