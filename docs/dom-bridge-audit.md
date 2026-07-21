# SIXFL DOM bridge audit

## Policy

Page features should be rendered by React/Next.js from explicit props or server data. Components must not discover page structure after render and then inject, hide, move, rename or restyle unrelated elements with selectors.

Legitimate browser APIs such as focusing an owned input, reading element dimensions through a ref, or using a deliberate portal are not automatically prohibited. The risky pattern is page scraping and post-render mutation.

Run the repeatable audit with:

```bash
npm run audit:dom
```

The audit reports suspicious DOM queries, element creation, mutation observers, class/style mutation, insertion and removal. It is intentionally a report rather than a failing build while legacy bridges still exist.

## Completed in this pass

- Deleted `InjuredPlayerAvailabilityBridge.tsx`.
- Availability rows now load injury state server-side and render the unavailable state directly.
- Match-selection rows now load injury state server-side and omit selection controls for injured players.
- Rebuilt `ManagedSquadInjuryBridge.tsx` as a normal React injury-management panel. Despite the legacy filename, it no longer queries or mutates page HTML.
- Added a database trigger preventing injured players from being marked available through a stale or crafted form submission.
- Replaced `NightBoardMatchFeeSyncBridge.tsx` with direct React fixture editors and live potential-issue calculations.
- Preserved the existing operational API path so fixture changes still synchronise match-fee charges/messages, cancel stale referee-night links and invalidate obsolete referee confirmations.
- Added both UI and API protection for completed fixtures while retaining the fixture form identity needed by the separate team-issue navigation feature.

## Highest-risk remaining areas

### P0 — globally mounted DOM mutation

These components are mounted from broad layouts and can therefore affect many pages when markup changes:

- `src/components/admin/night-board/NightBoardWarningsPositionBridge.tsx`
- `src/components/admin/payments/AdminPaymentsPageBridge.tsx`
- `src/components/captain/CaptainFixturesDeduplicateBridge.tsx`
- `src/components/captain/CaptainHeaderLeaguePositionBridge.tsx`
- `src/components/captain/HideImpossibleLeaguePositionBridge.tsx`
- `src/components/captain/TeamAutoPayCopyBridge.tsx`
- `src/components/public/NorthallertonWaitingListCopyBridge.tsx`
- `src/components/SixflTvFixtureBridge.tsx`

`src/app/layout.tsx` also contains a global `Element.prototype.closest` monkey patch. It appears to exist to protect legacy selector-based bridges from invalid selectors. It should be removed only after the dependent bridges have been replaced.

### P1 — operational and financial workflows

Replace these before cosmetic bridges because a markup change could affect payments, fixture operations or referee work:

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

These are still brittle but generally lower-risk than payment and fixture workflows:

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
- `src/components/admin/player-prospects/PlayerProspectsNotInterestedBridge.tsx`
- `src/components/admin/social/AdminSocialResultsGeneratorLinksBridge.tsx`

This is not an exhaustive handwritten list. `npm run audit:dom` is the source of truth and finds additional route-specific files.

## Replacement approach

For each bridge:

1. Identify the page or shared component that owns the markup.
2. Move the required query into its server loader or route action.
3. Render the element directly in JSX.
4. Pass explicit props to a client component only when interactivity is required.
5. Remove the bridge import and delete the bridge file.
6. Confirm mobile, captain/admin preview and empty-state behaviour.
7. Re-run `npm run audit:dom` and the production build.

Do not bulk-delete bridges. Several currently provide operational behaviour and must be replaced one workflow at a time.
