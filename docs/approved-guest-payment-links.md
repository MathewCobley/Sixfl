# Payment links for SIXFL-approved guests

Open the receiving team's **Matchday squad** or **Squad payments**, then select the fixture. Each approved guest has a **Guest payment** section.

The team captain or full SIXFL administrator enters the agreed amount and clicks **Create fee and send payment link**. No additional player request or pass code is required. Creating the fee confirms the captain has agreed the appearance and amount with the player. Approval itself still does not create a fee.

A positive amount creates the existing fixture-specific `PlayerMatchFee` with `temporaryUserId`, a secure payment token and URL, then queues the existing temporary-player payment email. £0 is an explicit no-payment choice and does not send a payment request. The permanent team and registration are unchanged. Existing temporary-player payments, public checkout, settlement, ledger and player fee views remain the payment authority.

Existing fees are reused. Paid, waived and cancelled records are not silently reopened, repriced or duplicated. Changes to already-created amounts, cash collection and cancellations remain in the existing payment administration. The new row shows payment and email status and provides **Send payment link**, **Copy payment link** and **Open payment link** where applicable. A saved fee survives an email-queue failure; retry operates on that same record.

Only the receiving team's authorised captain or full administrator can create/send. Captain/admin preview cannot write. The server rechecks active SIXFL approval, its revision, fixture identity/publication/time/status and the actor's actual role. Revoked approvals cannot be used for new creation/sending here; revocation does not automatically cancel an existing fee. Payments may be set for upcoming scheduled fixtures or completed fixtures in the last 30 days, using an approval recorded before kickoff.

Identity locks are shared with one-time pass redemption, preventing a parallel pass and direct guest action from creating duplicate fees. Email-queue work is serialised for the same fee across manual actions and the existing cron. Queue failure is reported separately from successful fee creation; queued is never presented as delivered. Fees created through this path receive an atomic `FixtureGuestPaymentAudit` record with the approving record/revision, amount and fee-creating actor.

Tests use a random localhost-only PostgreSQL schema, exercise real pass redemption races, preserve registrations and existing paid fees, verify atomic audit rollback and prove removal of the approval check causes a regression failure. No real player payments or customer emails are used by the tests.
