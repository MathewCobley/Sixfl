# Player payment reconciliation notes

The core issue was that paid player match fees could be recorded against a fixture without the related team `PaymentCharge` being permanently linked to that fixture.

That meant pages which calculated team-charge balances by `PaymentCharge.fixtureId` could miss partial squad payments, especially where the original charge had been created by date/due date rather than with a direct fixture link.

The fix is:

1. When a player payment is made, reconcile against the matching team charge by direct fixture link or fixture date.
2. Link the matched `PaymentCharge` back to the fixture if it was missing `fixtureId`.
3. Mark the charge `PART_PAID` for partial squad payments, not only `PAID` once fully covered.
4. Keep the display summary able to match paid player fees by fixture date as a fallback.
5. Provide `/admin/payments/reconcile` for a safe one-off/admin re-run across existing paid player fees.

Do not record manual duplicate payments to fix this. The reconciliation should make the existing player payments reduce the team charge balance.
