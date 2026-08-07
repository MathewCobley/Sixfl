# SIXFL DOM bridge audit

## Audit status

Formal audit started: **3 August 2026**.

New or modified DOM bridges are blocked by repository policy and CI unless an exact, approved and unexpired temporary exception exists in `config/dom-bridge-exceptions.json`.

The full legacy inventory remains a report so existing production behaviour is not deleted blindly. Changed source files are enforced immediately.

Run:

```bash
npm run audit:dom
npm run audit:dom:changed
node scripts/audit-dom-replacements.mjs
```

The GitHub **DOM bridge policy** workflow runs both the changed-file DOM audit and the native replacement-contract audit on every push to `main` and every pull request. It also produces a downloadable full DOM inventory.

## Policy

Page features should be rendered by React/Next.js from explicit props or server data. Components must not discover page structure after render and then inject, hide, move, rename or restyle unrelated elements with selectors.

Legitimate browser APIs such as focusing an owned input, reading element dimensions through a ref, or using a deliberate portal are not automatically prohibited. The risky pattern is page scraping and post-render mutation.

A temporary exception is permitted only when the DOM is genuinely outside SIXFL's control, the route scope is narrow, the code is non-critical and a replacement plan and expiry are recorded. Existing bridges are technical debt and are not precedent for new work.

Route-scoping a bridge is **containment, not completion**. A bridge remains unfinished until its behaviour is owned by normal React/Next.js code and its replacement contract passes.

## Replacement contracts

Deleting a bridge is no longer enough to mark the work complete.

Completed replacements are recorded in `config/dom-bridge-replacements.json`. Every contract must record:

1. The retired bridge/source path or paths.
2. The user-visible or operational responsibilities the old code provided.
3. The native source file or files that now own those responsibilities.
4. Stable source markers proving those native behaviours are still present.

`scripts/audit-dom-replacements.mjs` verifies every recorded contract. It fails when:

- a supposedly retired bridge still exists;
- a native replacement file disappears;
- a required replacement marker disappears; or
- a DOM/Bridge source file is deleted in a new change without being registered in a replacement contract.

This is specifically intended to prevent regressions where a bridge is removed but one of its less-obvious responsibilities is forgotten.

## Priority order

Continue the audit in this order:

1. **P0 broad/global bridges and browser monkey patches** — these can affect unrelated pages and have previously caused freezes or black screens.
2. **P1 payment, fixture and referee workflows** — markup-dependent operational behaviour must be moved into the owning pages and actions.
3. **P2 forms, navigation and cosmetic copy** — lower financial risk, but still brittle and difficult to maintain.
4. Remove the global `Element.prototype.closest` patch only after dependent legacy selectors are gone.

## Completed and contract-protected replacements

The replacement manifest now protects the key completed migrations reviewed in August 2026, including:

- Admin Player Pool navigation rendered directly by `AdminSidebar`.
- Captain PlayerPool navigation and SIXFL TV logo rendered directly by the captain team layout.
- Captain fixture deduplication handled by server-rendered fixture data rather than hiding a selected DOM row.
- Player Prospect chase, team-change, PlayerPool, Not interested and duplicate controls handled by `ProspectNativeActions`.
- Team future-unavailability navigation, captain overview reminder, admin planning navigation and pre-generator summary.
- Availability-history nudge controls rendered through `AvailabilityHistoryNudgePanel`.
- Dedicated server-rendered Harrogate signup presentation.
- Captain PlayerPool page logo rendered directly in JSX.
- Night Board operational fixture editing and live warning calculations handled by `NightBoardOperations`.
- Captain outstanding balance rendered from the payment ledger; the retired no-op balance bridge has been deleted.

Other completed work already includes:

- Injury state loaded through application/server data instead of scanning rendered squad rows.
- `ManagedSquadInjuryBridge.tsx` rebuilt as an owned React panel despite retaining its legacy filename.
- Database protection preventing injured players from being made available through stale or crafted submissions.
- Squad-payment summaries and fixture identity rendered directly from server data.
- Kit-offer copy/rendering moved to owned components with dedicated validation preventing retired kit bridges from returning.

## Known remaining DOM-mutating areas

This list is deliberately illustrative rather than authoritative. `npm run audit:dom` is the source of truth.

### P0 / broad presentation risk

- `src/components/admin/night-board/NightBoardWarningsPositionBridge.tsx`
- `src/components/admin/payments/AdminPaymentsPageBridge.tsx`
- `src/components/captain/CaptainHeaderLeaguePositionBridge.tsx`
- `src/components/captain/HideImpossibleLeaguePositionBridge.tsx`
- `src/components/captain/TeamAutoPayCopyBridge.tsx`
- `src/components/public/NorthallertonWaitingListCopyBridge.tsx`
- `src/components/SixflTvFixtureBridge.tsx`

`src/app/layout.tsx` also contains a global `Element.prototype.closest` monkey patch. It should not be removed until the remaining selector-dependent legacy code has been replaced and verified.

### P1 — operational and financial workflows

- `src/components/captain/SquadPaymentAmountSync.tsx`
- `src/components/captain/VoidFixturePlayerFeesBridge.tsx`
- `src/components/captain/VoidTeamChargeBridge.tsx`
- `src/components/admin/payments/PendingPlayerFeesBridge.tsx`
- `src/components/admin/payments/AdminVoidPaymentChargesBridge.tsx`
- `src/components/admin/referee-nights/RefereeNightCashDistributionBridge.tsx`
- `src/components/referee/RefereeNightPickerBridge.tsx`
- `src/components/referee/RefereeOnsiteColleaguesBridge.tsx`
- `src/components/admin/fixtures/GenerateNextWeekFixturesBridge.tsx`
- `src/components/admin/fixtures/FixtureCardResultLinksBridge.tsx`

### P2 — forms, navigation and copy polish

- `src/components/admin/teams/TeamDivisionPickerBridge.tsx`
- `src/components/admin/teams/TeamCompetitionPickerBridge.tsx`
- `src/components/admin/teams/TeamStandardMatchFeeBridge.tsx`
- `src/components/admin/teams/FreeKitTeamBadgesBridge.tsx`
- `src/components/layout/PublicLeagueSeasonSwitcherBridge.tsx`
- `src/components/layout/PublicLeagueLandingSpacingBridge.tsx`
- `src/components/layout/PublicFixtureWinChanceBridge.tsx`
- `src/components/admin/leads/AdminLeadEditButtonBridge.tsx`
- `src/components/admin/email-templates/EmailTemplateListControlsBridge.tsx`
- `src/components/admin/email-templates/EmailTemplatePollBridge.tsx`
- `src/components/admin/social/AdminSocialResultsGeneratorLinksBridge.tsx`

## Required replacement approach

For every remaining bridge:

1. Read the whole bridge and write down **every responsibility**, including navigation, labels, empty states, warnings, styling, status text, redirects, side effects and API calls.
2. Identify the page/shared component/action that should own each responsibility.
3. Implement the replacement with server data and JSX; use an owned client component only where interactivity is required.
4. Add or update the entry in `config/dom-bridge-replacements.json` **before deleting the bridge**.
5. Verify desktop, mobile, captain/admin preview, empty states and relevant error/success states.
6. Remove the old import/mount and delete the retired bridge only after all responsibilities are accounted for.
7. Run the DOM audit, replacement-contract audit, type-check/build and relevant workflow checks.
8. Do not describe route-scoping, disabling, returning `null`, or merely deleting a file as a completed replacement.

Do not bulk-delete bridges. Several still provide operational behaviour and must be replaced one workflow at a time.
