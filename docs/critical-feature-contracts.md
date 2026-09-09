# SIXFL Critical Feature Contracts

SIXFL must not lose working behaviour when a new feature is added.

## Completion rule

A change is complete only when:

1. the new behaviour works; and
2. every existing critical feature contract for the affected area still passes after the full production source-preparation chain has run.

A successful compile or build is not enough. A build can succeed while an existing button, safeguard, payment rule, selector state or workflow has silently disappeared.

## Blocking CI

The workflow `.github/workflows/critical-feature-contracts.yml` runs on every pull request and on `main`.

It deliberately runs `npm run prebuild` before checking contracts because SIXFL currently has a long source-preparation chain. Contracts therefore inspect the source that Railway will actually build, rather than only the source as it appeared before preparation.

For any critical behaviour that still depends on a preparation script, the workflow can also re-run that specific preparation after the complete prebuild and reject it if it changes already-prepared source. This makes the protected patch idempotent without pretending the whole legacy prebuild chain is already clean.

A red **SIXFL critical feature contracts** check means **do not merge**.

## Permanent-feature rule

Permanent product behaviour belongs in the React/Next.js/server source that owns it.

`apply-*.cjs` scripts are migration/compatibility debt. They may temporarily preserve old behaviour, but new permanent functionality must not rely solely on another post-processing patch being remembered in the correct order.

When a critical feature currently depends on a preparation script, its final behaviour must be protected by a feature contract until the patch is removed and the behaviour is native. Any preparation script used to preserve a protected feature must itself be safe to re-run after the full prebuild.

## Protected behaviour

### Team kit design reservation

- a kit design submitted by another team in the same league is reserved;
- the reserved design remains visible in the catalogue;
- it is greyed out;
- it is labelled **Taken**;
- it cannot be selected;
- stale or manually crafted submissions are rejected server-side;
- `DRAFT` kit orders do not reserve a design;
- `CANCELLED` kit orders do not reserve a design;
- concurrent submissions are serialized at league level so two teams cannot reserve the same design at the same moment.

### Player and team payments

- a new player payment link cannot be created for a player who has no saved email address;
- the captain UI clearly identifies that an email is required and prevents new selection for a link;
- player match-fee overrides remain admin-only on both the page and server action;
- every player fee override change retains an audit record;
- team credit remains a standard-team feature;
- team credit headroom remains capped at one match fee;
- existing credit is used before collecting more money;
- maximum further collection remains bounded by the outstanding fixture balance plus permitted credit headroom.

### Player identity safety

- a shared email address is not enough to merge or reuse a differently named player account;
- account resolution retains the `SHARED_EMAIL_DIFFERENT_PLAYER` conflict state;
- login-email resolution is serialized so concurrent activations cannot race through the duplicate check;
- managed-squad joining and signed-in activation both pass through the central identity-safety service;
- identity conflicts remain pending/separate instead of silently renaming, linking or merging people;
- blocked identity collisions remain auditable.

### League standings

- `src/lib/standings.ts` remains the authoritative entry point for league/team standings;
- product code cannot directly import the low-level `src/lib/leagueTable.ts` calculator;
- league-facing pages cannot introduce their own `buildLeagueTable()` calculator.

### PlayerPool

- the captain PlayerPool page remains natively available and branded;
- it stays scoped to the captain's team;
- captains retain the introduction-request action;
- approved introductions retain the add-to-squad action.

### Team lead confirmation

- the public confirmation page must read league name, start date, match length, fee, venue and kick-off context from the lead's current prospective league rather than hard-coded launch details;
- confirming a place reserves/qualifies the lead but does not automatically create a `Team` or fixtures;
- after confirmation, an unconverted team lead can save or update its team name on the same signed confirmation link;
- the lead can explicitly choose to confirm the team name later and return to the same link without losing the reserved place;
- once the lead has been converted into an actual team, the public confirmation page must not allow the lead team name to be changed.

These assertions live in `scripts/check-critical-feature-contracts.mjs` and dedicated executable contract scripts such as `scripts/check-team-confirmation-contract.mjs`; the critical-feature workflow runs them after the complete production source-preparation chain.

## Areas to add next

The contract framework should continue to expand when these areas are changed:

- remaining kit payment/order readiness rules;
- managed/standard squad switching;
- fixture publication and availability;
- result entry, disputes and correction workflows;
- captain/player/admin preview boundaries;
- referee and night-board operations;
- notification delivery and template ownership.

Do not create a large fragile snapshot of whole pages. Protect the business rules and user-visible controls that must survive future work.

## Adding a new contract

When fixing a regression or adding an important invariant:

1. implement the correct behaviour;
2. add an assertion to `scripts/check-critical-feature-contracts.mjs` or a dedicated executable contract test;
3. make the contract describe the business rule rather than the current ticket;
4. run the complete prebuild chain before the contract;
5. if a critical preparation script is still required, prove that re-running that script does not alter the already-prepared source;
6. ensure the test fails if the protected behaviour is deliberately removed in a temporary branch;
7. only then merge.

Every regression that reaches production should, where practical, leave behind a permanent automated check so the same failure cannot recur silently.
## Fixture fee inheritance

`src/lib/payments/fixture-fee-policy.ts` owns publishing fee inheritance. Generate next week snapshots each team's own standard fee. Single, week and batch publishing and the explicitly requested repair action use the same resolver: explicit side fee (including zero), then the team standard, then the legacy fallback. TBC placeholders remain uncharged. Stored fixture agreements and paid-charge protections are preserved.

`tests/fixture-fee-inheritance.test.cjs` runs the real generator, publishers and charge-sync code with isolated I/O. The fixture-fee workflow runs it before and after the complete prebuild, checks retired publishing patches are idempotent, and proves both the missing-generation-fee and lost-team-fallback regressions fail tests. No test sends customer messages or accesses production data.


## First-match readiness briefing

The shared first-match-ready service replaces the existing firstFixture onboarding stage. Automatic eligibility is the whole 48-hour interval before the first published scheduled fixture, including same-day publication; kick-off is an exclusive boundary. Completed/results history and earlier published past fixtures prevent established teams being reintroduced. The original template key and legacy queue markers remain authoritative for duplicate suppression; rollout does not resend or rewrite old messages. The default template is migrated only when unchanged, retaining edits and disabled state. Manual and automatic requests use the same transactional queue, with a final provider guard and read-only dispatch status on Admin Captain onboarding. Tests use disposable PostgreSQL and block provider HTTP calls.


## Player receipt integrity
All ordinary player checkouts and repayment checkouts must use the same independently recorded obligation and verified receipt service. An £8 receipt against £12 leaves £4 open; it cannot become a full settlement or an inferred £4 SIXFL subsidy. Duplicate sessions and payment intents subtract only once; repeated old booked receipts do not rewrite historic accounts. Only explicit concession evidence can add non-cash settlement. Direct team charges retain their original amount and remain part-paid after a smaller payment. The disposable PostgreSQL ledger workflow exercises the actual signature-verified webhook as well as shared settlement, refunds, caps and the receipt-based native captain history after the full prebuild chain.

## Administrator SMS replies

The native inbox reply form uses an explicit authenticated JSON POST, not a redirecting server-action form. A controlled per-actor/per-thread draft and stable request reference survive errors and reloads. The shared SMS service saves notification, message and thread update in one transaction, serializes thread submissions, and uses a deterministic message ID to make same-request retries idempotent. Recovery GET never queues or sends. Existing SMS opt-outs, suppression, quiet hours, mixed email/SMS history and member-only identity boundaries remain enforced. Queued/failed messages are never labelled sent from their creation time. Tests run the real service and route against disposable PostgreSQL with all provider traffic blocked, plus real browser submission/recovery and post-prebuild source contracts. No historical messages are replayed.
