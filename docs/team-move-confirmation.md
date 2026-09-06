# Team move confirmation

Admin Teams cards and the individual Team settings page share `TeamMoveConfirmationSelect`. The three options are **Awaiting confirmation**, **Confirmed — OK to move**, and **Not moving**. Selecting an option saves immediately through `saveTeamMoveConfirmation`, with Saving/Saved/error feedback and the last update time/administrator name. A failed request restores the previous displayed choice.

This is manual administrative tracking for the planned move, not a transfer or withdrawal instruction. It sends no email/SMS, does not alter league/season membership, fixtures, squads or payment allocations, and is not exposed to captains as a consent form. No existing team is assumed to have agreed. To track a later move, reset the response to Awaiting confirmation first; this is a single current-response field, not a multi-move history.

The authoritative value is `Team.moveConfirmationStatus` (PENDING/CONFIRMED/DECLINED), alongside `moveConfirmationUpdatedAt` and `moveConfirmationUpdatedBy`. The action requires an authenticated administrator, validates all inputs and targets the exact Team id, with a previous-status check so a different intervening response is not overwritten. It does not spread browser input into database updates. Team edit forms do not reset these independently saved fields. Existing season-deduplication behaviour on the Teams list is retained; responses are never copied to unrelated/same-named records.

The additive migration defaults existing teams to PENDING and preserves saved values on re-run. It does not infer replies from email or change any operational record.

`Team move confirmation` CI runs after full production prebuild. Node tests cover labels, admin authorization, malformed input, stale saves, cache failure, native markup and an isolated localhost PostgreSQL migration/persistence check. Chromium uses the real component with an offline mock server action to check success, failure rollback, saved-state rendering and width at desktop/mobile sizes. No customer messages or payments are triggered.

A successful build and deployment do not imply that a real team's response has been changed or that the authenticated production Teams page has been viewed. Report those separately.
