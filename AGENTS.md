# SIXFL repository rules

## Email and SMS content

- All automated or administrator-triggered email and SMS subjects, bodies and CTA labels must be stored in `NotificationTemplate` and editable through the SIXFL System Templates interface.
- Application code may reference a stable template key and supply variables, recipient details, branding and metadata. It must not contain the final customer-facing subject or message body.
- Use `queueNotificationFromTemplate` for delivery. Do not add new direct `sendEmail` calls or `queueDirectNotification` calls for reusable system messages.
- Add new templates through an idempotent database migration so production receives them automatically. Preserve administrator edits when a template key already exists.
- A hard-coded message is acceptable only for an exceptional one-off diagnostic or security response that is not sent to customers; document the reason in code.

## League tables and standings

`src/lib/standings.ts` is the single authoritative entry point for every SIXFL league table.

- Admin, public, captain, player, API, PDF, social and reporting features must call `getLeagueStandings()` or `getTeamStanding()`.
- Do not create another table calculator, division query, position calculator or alternative standings API.
- Do not query `LeagueSeasonTeam`, `LeagueDivision`, completed fixtures or match results directly to build standings outside the central standings service.
- `src/lib/leagueTable.ts` is the low-level calculator owned by `src/lib/standings.ts`; new product code must not import it directly.
- Visual components may differ, but rows, divisions, positions and team totals must come from the central service.
- Active current-season membership is authoritative. Affiliated-only, removed and fixture-placeholder teams must never appear in standings.
- Change standings rules centrally and verify every consumer rather than patching individual pages.

## Change-completion standard

Do not report a partial change as complete. Before saying a task is **done**:

1. Search the whole repository for the visible wording, template key, component, action and related routes.
2. Identify and change the shared source of truth wherever one exists. Do not patch one screen or one sending route when several use the same feature.
3. Check every route that can create the affected output, including admin, captain, public, API, cron and template-driven paths.
4. Make route-specific changes only when the behaviour genuinely differs. Shared presentation and branding must live in the shared renderer or component.
5. Search the repository again after the change for stale wording, duplicate implementations and hard-coded overrides.
6. Fetch and inspect the committed files after every write. Do not rely only on a successful update response.
7. Check build and deployment status. Report separately whether the change is committed, deployment is pending, deployment passed, and the live behaviour has actually been verified.
8. Never say the live site is fixed while deployment is pending or when only an older saved preview has been inspected.

Every completion report must state the shared source changed, the affected routes checked, the post-change search result, the commit SHA, the deployment state, and anything not yet verified live.
