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

The workflow also runs the preparation chain twice and rejects the change if the second run changes the prepared source again. This catches order-dependent and non-idempotent build patches.

A red **SIXFL critical feature contracts** check means **do not merge**.

## Permanent-feature rule

Permanent product behaviour belongs in the React/Next.js/server source that owns it.

`apply-*.cjs` scripts are migration/compatibility debt. They may temporarily preserve old behaviour, but new permanent functionality must not rely solely on another post-processing patch being remembered in the correct order.

When a critical feature currently depends on a preparation script, its final behaviour must be protected by a feature contract until the patch is removed and the behaviour is native.

## First protected area: team kit design reservation

The following behaviour is now a permanent SIXFL contract:

- a kit design submitted by another team in the same league is reserved;
- the reserved design remains visible in the catalogue;
- it is greyed out;
- it is labelled **Taken**;
- it cannot be selected;
- stale or manually crafted submissions are rejected server-side;
- `DRAFT` kit orders do not reserve a design;
- `CANCELLED` kit orders do not reserve a design;
- concurrent submissions are serialized at league level so two teams cannot reserve the same design at the same moment.

These assertions live in `scripts/check-critical-feature-contracts.mjs`.

## Areas to add next

The contract framework should be expanded whenever these areas are changed:

- kits and kit payments;
- team and player match-fee collection;
- team credit and payment caps;
- player creation, identity collision prevention and merges;
- managed/standard squad switching;
- player pool and prospect workflows;
- fixture publication and availability;
- results and league tables;
- captain/player/admin preview boundaries;
- referee and night-board operations.

Do not create a large fragile snapshot of whole pages. Protect the business rules and user-visible controls that must survive future work.

## Adding a new contract

When fixing a regression or adding an important invariant:

1. implement the correct behaviour;
2. add an assertion to `scripts/check-critical-feature-contracts.mjs` or a dedicated executable contract test;
3. make the contract describe the business rule rather than the current ticket;
4. run the complete prebuild chain before the contract;
5. ensure the test fails if the protected behaviour is deliberately removed in a temporary branch;
6. only then merge.

Every regression that reaches production should, where practical, leave behind a permanent automated check so the same failure cannot recur silently.
