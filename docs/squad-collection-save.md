# Squad collection save regression

The owning Squad Payments form now uses `SquadPaymentCollectionForm` and the pure
`squad-collection-form` validation helper. A zero waived row cannot initialise the
default, and individual amounts are validated before any collection writes. The
default is required only for selected players with a blank individual amount.

The native save action remains authoritative for the captain route and its admin
view. A presentation-only adapter translates its exact expected result redirects
into local feedback. Sign-in/access/unrelated redirects are rethrown. Unknown
failures explicitly leave the result unconfirmed: some writes might have completed.
There is no automatic retry, forced resend, new payment writer or ledger mutation.

Hydrated submissions keep the owning form mounted on validation and server errors,
show pending/error/saved feedback next to Save, and prevent duplicate clicks while
pending. Entries stay in this page's memory, not browser persistent storage. An
uncertain result requires checking the saved collection before another submission.
Saved email counts mean queued, not delivered. Protected and paid rows retain the
existing server safeguards, with protected inputs remaining disabled.

The permanent CI workflow executes the real native and production-prepared save
actions with isolated dependency mocks, checks the original-bug negative control,
critical contracts, TypeScript and production build, and exercises the actual
owning page's input markup/client form in Chromium at desktop/mobile sizes.
External services and production data are never used by these tests. Existing
player-ledger CI supplies separate real-PostgreSQL receipt/refund/credit coverage.
