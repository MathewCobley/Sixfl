# Urgent team-specific fixture fee regression — 1 Sep 2026

## Symptom
A team with `standardMatchFeePence = 3600` (e.g. SWAZ) can receive a £40 fixture charge when the opponent/fixture display fee is £40.

## Root cause found on current `main`
The codebase has team-specific fixture fee support (`homeMatchFeePence` / `awayMatchFeePence`) and `syncFixtureMatchFeeCharges` correctly charges each side using those separate values.

However, the current fixture creation/publish paths have regressed to a legacy shared-fee implementation:

- `src/app/(admin)/admin/fixtures/generate/single-fixture-action.ts` creates a fixture with only `matchFeePence`, using `Math.max(homeTeam.standardMatchFeePence, awayTeam.standardMatchFeePence)`. It does not persist `homeMatchFeePence` / `awayMatchFeePence`.
- `src/app/(admin)/admin/fixtures/publish-actions.ts` resolves one `matchFeePence` and passes that same value as both `homeMatchFeePence` and `awayMatchFeePence` to charge creation and payment messages.
- `src/app/api/admin/fixtures/publish-one/route.ts` does the same for individual publishing.

Therefore, if SWAZ is £36 and the other side is £40, the fixture display fee can be £40 and the publish path incorrectly creates SWAZ's charge at £40 too.

This is a regression: `scripts/apply-fixture-team-fee-overrides.cjs` and `scripts/apply-publish-tbc-fee-safety.cjs` contain the intended changes to persist/use separate side fees, but the current source files no longer contain those changes.

## Immediate data safety
Do not alter the team's £36 standard setting; that setting is not the cause.

For an affected fixture with no recorded payment, edit the fixture and explicitly set SWAZ's side fee to £36 (and the opponent's side fee to its correct amount). The fixture edit action calls `syncFixtureMatchFeeCharges` with the two separate values and can reconcile an unpaid charge.

If any payment has already been recorded against the incorrect £40 charge, do not blindly edit/refund: `syncFixtureMatchFeeCharges` intentionally refuses to change a charge amount after a payment has been recorded. That case needs a controlled correction/refund/reallocation.

## Required code fix
Restore team-specific fee handling in all fixture creation and publish paths and add a regression contract that proves a £36 team playing a £40 team generates separate £36 and £40 charges. Also provide a safe repair for existing unpaid affected charges.