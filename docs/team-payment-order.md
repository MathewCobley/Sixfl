# Team payment order

## Rule and ownership

Direct standard-team payments must clear the oldest eligible outstanding charge before a newer charge can be paid. Order is due date, then fixture kick-off when no due date exists, then record creation date; creation time and charge ID break ties deterministically.

`src/lib/payments/team-payment-order.ts` reads the authoritative `getTeamPaymentLedger()` balances and delegates ordering to `team-payment-order-policy.ts`. It does not introduce another settlement calculator. Paid, voided, fully covered/waived and unavailable-fixture charges do not block newer payment. Managed squads and managed-era history before a standard-team conversion are not treated as standard-team debt. The existing ledger's historical-team identity mapping is retained, not broadened by this feature.

## Entry points

- Captain Team payments shows the decision for each charge and a persistent older-debt warning.
- Public charge pages and their POST checkout action enforce the same rule, including links already distributed in email or SMS. A blocked checkout returns to its explanatory page; it never silently charges for a different fixture.
- Saved-card matchday collection pauses blocked newer charges. It retains the verified fee cap, setup evidence, matchday-only mandate and idempotency checks. It never adds historic arrears to a debit or silently reallocates a current-match payment.
- Unallocated team credit follows oldest-first ordering. The credit-allocation function reports only credit actually used against its caller's fixture, so older debt settlement cannot be counted as the current squad's contribution. Credit allocation does not prepay unrelated later fixtures.

## Squad exemption

Individual player-fee checkouts and the captain's dedicated cash-remittance route remain fixture-specific. The latter is bounded by the recorded available captain-collected player money; a browser query parameter cannot turn a direct team checkout into a remittance.

The separate action that substitutes unallocated team credit for a captain remittance follows team-credit ordering, because that balance is team credit rather than newly forwarded player cash.

A newer fixture can therefore become fully settled through squad contributions while older team debt remains unpaid. The team warning must remain visible. An optional credit-order lookup failure must not prevent genuine player payment; mandatory direct-team checkout checks fail closed.

## Administration

Admin sidebar: Payments > Payment order (`/admin/payments/payment-order`).

A logged-in administrator can put a selected charge on hold, permit a selected charge to be paid out of order, or reset normal ordering. A reason is required. Holds/permissions expire after 1–30 days. Holds pause direct collection of that charge and remove it as a blocker; they do not waive the debt. A permission applies only to the selected charge. Every action appends the actor, time, reason and expiry to `TeamPaymentOrderException`. Latest action wins before expiry filtering, so an expired exception cannot resurrect an earlier one.

## Already opened Stripe checkouts

The protected notifications cron runs `team-payment-order-checkouts` as an independent step. Each invocation leases and scans one resumable page of open Stripe sessions, including legacy sessions no longer in the latest cached URL. Only verified direct-team sessions that now conflict with the policy are expired. Player, kit, setup and captain cash-remittance sessions are excluded. Progress/failure is visible on the admin Payment order page; an administrator can run the next cleanup page without invoking the other notification or payment jobs.

A previously opened Stripe session can remain usable until its cleanup page is processed. Stripe cannot expire a checkout that has already completed. If completion wins that race, the original payment allocation is retained and the cleanup encounter is audited. The webhook continues to record money actually received against the stated charge. This rule never rewrites completed historical, external/offline or existing subscription receipts.

Cached direct checkout URLs are checked with Stripe before reuse. Expired sessions are not reused; completed sessions awaiting their receipt cannot create a second payment request.

## Tests and deployment

`.github/workflows/team-payment-order.yml` runs the full production source-preparation chain, then `tests/team-payment-order*.test.cjs`, critical contracts and TypeScript. Tests cover ordering, partial abandoned fees, due dates, paid/void/waived balances, holds/expiry, managed boundaries, public POST gates, cached checkouts, scanner exclusions, credit accounting and saved-card scope. PostgreSQL tests use a dedicated localhost-only database and test migration idempotence, audit constraints, concurrent leases and preservation of a sentinel historical receipt. A negative control removes the oldest-first gate in the ephemeral CI checkout and requires the regression tests to fail before restoring it.

No customer card or email/SMS is used in these tests. The migration only adds policy/audit tables and seeds a maintenance row. Before announcing the change as live, verify the merged commit's Railway deployment and migration. Distinguish deployment success from a real authenticated captain view or a completed customer payment; those are not implied by CI success.
