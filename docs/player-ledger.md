# Player ledger and optional smaller payments

## User workflow

Ordinary Squad payments keep their existing fixture/player selection, actual fee amounts and full-payment links. `Player balances and smaller payments` opens accounts; `Arrange smaller payments` is an optional disclosure in an account, not a required field on every normal player row.

A plan selects existing ordinary unpaid charges and an agreed weekly payment. A £12 balance with an £8 instalment stays £12 until a confirmed receipt, then becomes £4. Newly added match charges remain outside the arrangement. Genuine reductions and money received by the captain are explicit separate operations with reasons and actor identifiers. Ending a plan or pausing a payment link does not forgive any debt.

## Accounting sources

`src/lib/payments/player-ledger.ts` owns player balances, account identity and plan/adjustment operations. `PlayerLedgerEntry` is append-only; `PlayerFeeLedgerState` is its per-charge balance projection. The import preserves current recorded amounts and does not reconstruct overwritten earlier amounts or invent old receipts. Financial entries survive removal of related memberships. A mismatch between statement entries and projection is an error, not a zero balance.

Database capture covers normal existing fee writers. A BEFORE guard protects controlled balances and their cash-compatibility marker, while AFTER capture records only rows actually inserted/updated/deleted, including conflict-skipping and upsert semantics. Opening a statement never sends messages or rewrites old charges. Unpublished ordinary charges are not exposed in player totals; real ledger-managed debts remain recorded if a fixture is later unpublished. The existing unified player dashboard retains exact-user temporary-player balances, while individual team statements remain separate.

`player-repayment-checkout.ts` owns immutable collection requests, Stripe idempotency, verified receipts and reversing entries for confirmed refunds. Payments allocate to the original team and fixture charge. Actual SIXFL transactions are distinguished from legacy paid-fee snapshots to avoid double counting cash and credit. Captain receipts are private money until the existing remittance flow records actual money arriving at SIXFL. An instalment request is never evidence of receipt.

Special concessions, subsidies and existing applied player credits are not automatically converted into ordinary debt. Existing managed-team no-credit and standard-team credit limits remain enforced. Unresolved checkout creation, an in-progress payment or an inconsistent allocation is held for review rather than treated as paid or erased.

## Messaging and permissions

Only expressly saved plans are picked up by the normal notifications job. Each due instalment has one editable System Template email. Existing individual fee chases are held during an active/paused/review arrangement and checked again before provider delivery. No additional automatic SMS or stored-card debit is created. Existing preferences and suppression are preserved.

Captain actions require access to the exact team and validate selected fees/plans/requests against that player's account. Player statements use the signed-in user's exact identity and established source-prospect links, never email-only or name-only merging. Public payment tokens expose only that player's relevant payment summary.

## Required verification

`tests/player-ledger.test.ts` uses disposable localhost PostgreSQL, the actual migration/services and a fake Stripe boundary with external HTTP forbidden. It must verify ordinary fee behavior, £12/£8/£4 allocation, concurrent requests and webhooks, lost responses, cancellation/expiry, old checkout handling, confirmed refunds, private captain receipts, credit limits, immutable history, draft privacy, temporary-player balances, template preservation and absence of automatic requests without a plan. Existing payment, fixture-fee, identity, DOM and critical-feature checks must also pass after the full prebuild chain. Successful tests are not a claim about an individual live player's balance or receipt.
