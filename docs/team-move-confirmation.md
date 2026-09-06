# Team move confirmation

## League scope

In Admin → Leagues → edit a league, tick **League move** and click **Save changes**. The saved `League.isMoving` flag determines whether its teams show the move-confirmation dropdown on Admin Teams cards and individual Team settings. Unticking and saving hides those controls without deleting any recorded team response. New leagues default to off. The one-time rollout migration enables only **Northallerton Wednesday Mens — Summer 2026**, as identified in the request; other leagues remain off. Replaying that migration does not undo a later administrator decision to turn it off.

This is native React/server behaviour. `LeagueForm` owns the checkbox; create/update league actions persist it. The two team pages query their team's actual League relation and pass its flag to `TeamMoveConfirmationSelect`. There is no name-based visibility rule, inheritance from a different competition season, DOM bridge, post-render hiding or new production source-patching script. An old open league form that lacks the new field marker cannot silently clear the setting.

## Team response

The shared `TeamMoveConfirmationSelect` offers **Awaiting confirmation**, **Confirmed — OK to move**, and **Not moving**. Selection autosaves through `saveTeamMoveConfirmation` with Saving/Saved/error feedback and the last update time/administrator name. Failed saves restore the previous displayed choice.

`Team.moveConfirmationStatus` and its last-update fields remain the response source. The administrator-only save action targets the exact Team id and previous status and checks the current persisted `League.isMoving` relation in the same database write. A stale page cannot save a response after the league is unticked or the team is reassigned to an unchecked league. No league means no dropdown and no response write.

This is manual response tracking, not an actual transfer, withdrawal, email-reply interpretation or a captain consent form. It does not change membership, fixtures, squads, payments or send messages. Turning tracking off does not reset responses. For a genuinely different planned move, review/reset the old team responses before reusing them; this is one current response, not a multi-move history.

## Verification

The existing move-confirmation workflows run after full production prebuild. Added scope tests cover native visibility, checkbox checked/unchecked/legacy form submissions, administrator checks, default-off leagues, narrow rollout and replay, response preservation and actual Prisma action writes against isolated localhost PostgreSQL. Chromium tests exercise the real league form and dropdown at desktop/mobile widths with offline save mocks, including failure/retry and hiding/restoring an existing confirmed response. Existing response, payment, login and other critical-feature checks remain required.

Deployment/migration success and offline tests must be reported separately from authenticated production-page inspection. No real team response or customer payment/message is used as a test.
