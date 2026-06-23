# SIXFL Regression Checklist

This checklist protects the admin, captain and player flows from silent regressions when routes, layouts or components change.

## Rule

Critical controls must be rendered directly by the page or by a typed React component. They should not depend on DOM scanning, class-name matching or `MutationObserver` bridges unless the bridge is clearly marked as temporary.

## Admin squad console

Status: hardened.

Check:

- Admin squad console shows every squad member.
- Role selector works for captain, manager, vice-captain, player, backup player and coach.
- Dashboard login status is visible for linked users.
- Send login email button is visible and works.
- Player preview link is visible and opens the correct player.
- Player comms link opens the correct player communications page.
- Move to prospects works.
- Remove from squad works.
- WhatsApp status/badge appears where expected.

Implementation note: these controls are now rendered directly in `src/app/(admin)/admin/teams/[id]/squad/page.tsx`.

## Captain-only preview

Status: partially hardened.

Check:

- Captain-only preview enters through `/admin/teams/[id]/captain-preview` so the preview cookie is set.
- Direct admin access to `/captain/team/[teamid]/captain-squad` redirects through the real captain-preview route.
- Clicking Squad in captain-only preview stays in captain squad view.
- Admin-only tools are hidden in captain-only preview.
- Return to full admin view clears the preview cookie.

Implementation note: `/captain/team/[teamid]/captain-squad/layout.tsx` now guards against admin preview leakage.

## Player preview

Status: partially hardened.

Check:

- Team-level Player view chooses a real linked squad member.
- Per-player Player preview opens the correct player.
- Preview membership ID persists when clicking player dashboard links.
- Availability page displays the selected player's availability.
- Saving availability in preview updates the selected player only.
- Sign out is not shown as a normal player action in preview mode.

Implementation note: availability preview is server-side aware of `previewMembershipId`; the main player dashboard still uses `PlayerPreviewLinkPersistence` to preserve preview links and should be refactored when practical.

## Prospects and pending activation

Status: needs review.

Check:

- Pending activation controls are visible.
- Move/activate prospect controls are visible.
- Return/unassign controls are visible.
- Delete controls are visible.
- Prospect comms links still point to the right prospect/player.

Risk: several controls still rely on bridge components and DOM selectors.

## Payments

Status: reviewed as medium risk.

Check:

- Team payments page shows expected actions.
- Squad/player payment labels are visible.
- Void/cancel payment controls are visible where expected.
- Player match fee links point to the correct player/fixture.

Implementation note: the main player fee chase actions are directly rendered on the admin payments page. The remaining payment labels bridge appears mostly cosmetic, but should still be reviewed before route/layout changes.

## Fixtures, results and social tools

Status: needs review.

Check:

- Fixture generation helpers still appear on admin fixture pages.
- Captain availability badges still appear.
- Result/social generator links still appear.

## Before deployment after route/layout changes

- Search for `MutationObserver`, `Bridge`, `querySelector`, and route-specific regexes.
- Check any changed route against this file.
- Confirm Railway build passes.
- Manually visit admin squad console, captain-only preview, player preview, prospects, payments and fixtures.
