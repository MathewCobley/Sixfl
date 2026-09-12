# Referral ineligibility

Admin → Team referrals → an unpaid referral → **Mark not eligible**. Select a public reason, record a private note, confirm and save. Existing/renamed teams can be marked without deleting the lead or team. The referrer sees **Not eligible — Existing or renamed team**; the private note and administrator identity never enter the player query or customer messages.

The eligibility decision preserves the original referral, reward and match history; records reason, note, actor and timestamp; removes unneeded encrypted bank details (retaining submission timestamps); and atomically cancels queued/failed recorded/reward-ready emails. Previously sent emails remain on record. It does not change the team, fixture or any payments.

## Referrer update email

Confirming the updated admin form also requests one brief transactional **Referral not eligible email** to the referring player's current account email, not the team captain or match referee. Its subject, body and CTA are editable in System Templates (key `team-referral-ineligible`). Variables are restricted to firstName, teamName, rewardAmount, eligibilityReason and referralsUrl. The notification service never selects private review notes, bank data or decision-maker identity for message content. The normal queue sends the email; suppression and preferences remain respected. Queued does not mean delivered.

An already-saved decision displays **Referrer update email** with a preview, confirmation and **Email referrer** button. Read/refresh and deployment never send historical updates. Old open forms without the new notification flag can still save a decision without a surprise email; they show a prompt to use the explicit button. Repeated/concurrent requests retain one dispatch per referral, including failed/skipped/cancelled messages. Failed, skipped or cancelled updates remain visible for administrator review; this panel does not silently retry or create a second notice. The panel shows the recorded message and current status.

Queue creation happens after the eligibility transaction. A missing template, missing email or queue error cannot undo the decision: the admin sees that the decision remains saved and that the email needs attention. The separate eligibility-update source is not treated as a reward-ready notice. A database constraint restricts it to email and prevents queueing/claiming it for an eligible or already-paid referral. No payout promise is reactivated.

`referralStatus` is the shared status source. Ineligible referrals cannot contribute to Ready to pay or Amount due, display reward progress, receive payout-ready notices, save bank details, or be marked paid. Old payout links show the eligibility decision instead of banking controls. Producers and cron selectors exclude ineligible rows; scoped database guards reject stale reward email claims/retries. Already-paid records cannot be rejected. Decisions cannot be silently edited/deleted or reactivated; a future reversal needs an audited review feature.

A currently PROCESSING reward email prevents rejection with an explicit retry message: the control does not promise to recall a message already being sent. The referral row lock serializes the eligibility decision with payment and send claims. Other notification types and the player's unrelated referrals are unaffected.

No existing referral is changed, no old decision is automatically notified and no SMS or bank transfer is initiated by deployment. Permanent tests exercise the real template and queue, recipient targeting, concurrent requests, suppression, audit privacy, saved-decision recovery, templates edited by admins, migrations and browser controls using isolated test data only.
