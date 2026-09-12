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


### SMS reply receipt recovery

A saved SMS acknowledgement and request reference must survive a reload and returning to the conversation, not just a failed-send draft. The last checked status is dated and is never described as a new delivery confirmation. Browser storage remains per administrator and per thread. A read-only, authenticated recent-history GET retrieves up to ten manual outbound SMS entries from the exact conversation in the last seven days even when the browser reference has been lost. It never repairs, requeues or calls the provider. Both inbox entry routes pass authenticated reply identity and the real queue status to the shared native form. Trace logging contains only request/thread/message/dispatch identifiers and saved status; no phone numbers, message text or credentials. New browser and real PostgreSQL tests preserve duplicates, lost responses, separate actors/threads, opt-outs and quiet hours.

These safeguards address verified receipt-loss and recovery gaps. They do not assert that an untraced historical reply was delivered or replay it. Deployment/startup and historical provider delivery remain separate verification steps.


## Receipt provenance and visible balance reconciliation

Modern player-ledger allocations and their signed refunds must remain player receipts in both fixture details and recent history; they are not additional direct team payments. The native shared receipt presentation reuses modern accounting markers and the legacy classifier. Player names resolve from both historic Player fee ID and modern Account fee reference formats, including older fixture receipts outside the latest 20 history rows. A canonical due-charge breakdown sums to the headline. Captain-reported receipts are shown separately from SIXFL receipts, without claiming they are still held after remittance; open player balances and allocation discrepancies do not create extra team debt. Tests cover four £6 player receipts, £35 captain reports plus £13 unpaid, £40 + £16 = £56, signed refunds, team credit, real separate team receipts and production-prepared browser layouts. These presentation changes never fabricate a missing remittance or edit historical charges.

The legible ledger uses explicit Applied to fixture, Paid to captain and Player still owes columns from the same canonical player display object. The fixture equation uses the canonical charge, applied amount and remaining balance. Team identity is named in the page heading. Receipt history is collapsed and marked already included. Desktop and mobile tests preserve 8 = 5 + 3 and keep all payment controls and read-only provenance checks.


## Internal player concessions are administrator-only

Player caps, subsidies and SIXFL player adjustments are private administrative
information. Customer Team Payments and Squad Payments show the settled
nominal player share, not its internal cash/subsidy split. Never call a
non-cash settlement money received. Player dashboards show the player's actual
receipt and liability, not an adjustment against the team's nominal share.
Only server-verified administrator access may opt into internal status/copy.
Captain-only preview stays a customer view even for an administrator. Private
breakdowns must be absent from returned markup and attributes, including
collapsed content; CSS hiding is not sufficient. Actual receipts, liabilities,
fee waivers and credit arithmetic remain unchanged.

The ledger-consistency workflow renders both roles and captain-only preview,
verifies entire HTML before/after full production preparation, and opens
collapsed sections in browsers at desktop/phone widths. Tests also cover
fail-closed helper defaults and an admin boolean without the server role.
The example remains £37 settled / £3 due; only the administrator sees the
£18 cash / £19 internal adjustment breakdown.

## Veo choices at fixture confirmation

The shared `src/lib/veo/confirmation.ts` service owns one-match requests, explicit
ongoing preferences, exact active captain permission and camera-night finalisation.
Confirmation and the optional request report separate outcomes: a failed Veo save
cannot silently un-confirm attendance. The same client choices appear in previews
without a live form/action. A remembered preference can be skipped for one fixture;
turning it off never changes accepted bookings or just-this-match requests.

The additive confirmation migration changes only the Veo *phase*, not league
activation or existing customer preferences. New publications keep base fees and
pitches unchanged. The finalisation preview spans the physical venue/pitch/night,
including other enabled leagues and every division, and counts protected existing
filming bookings against the same capacity. It never changes opponents or kickoff.
Preview hashes and serializable transactions prevent stale or double finalisation.

Accepted requests create a separate, uniquely linked £5 PaymentCharge, not an edit
to a paid match bill. Explicit free fixtures remain free. Earlier Veo snapshots are
never rewritten. A recording failure or material fixture change cancels only these
new add-ons. Narrow database triggers keep cancelled charges void and reconcile
actual net receipts to one deterministic team-credit entry, including late receipts.
No credit is invented for an unpaid add-on. Original receipts remain in history.

Booking updates use editable NotificationTemplates and a retryable outbox. Testing
uses disposable localhost PostgreSQL only, plus the actual client component in a
test host created after production build. The test host is not deployed. CI retains
legacy Veo allocation checks before applying the new phase migration and then
checks both-league capacity, current requests, immutable bills, failed filming,
late receipts, captain previews and post-prebuild source wiring.
