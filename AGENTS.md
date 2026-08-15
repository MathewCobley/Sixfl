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

## DOM bridges and post-render page mutation

DOM bridges are prohibited by default.

A feature must be implemented in the React/Next.js page or component that owns the markup, using explicit props, server data, route handlers, server actions or a normal route-scoped client component.

Do not implement product behaviour by scraping the rendered page and then injecting, hiding, moving, renaming, restyling or rewiring unrelated elements with selectors.

The following patterns are banned unless an approved temporary exception exists in `config/dom-bridge-exceptions.json`:

- page-wide or layout-wide `MutationObserver` use;
- `document.querySelector*` or DOM walking used to discover application structure;
- `document.createElement`, `innerHTML` or insertion APIs used to add application UI outside an owned portal;
- changing unrelated elements through `classList`, direct style mutation or text replacement;
- monkey-patching browser prototypes;
- globally mounted components that inspect routes and alter other pages after render.

Normal browser APIs are allowed when they operate on elements owned by the component, for example focusing an input through a React ref, measuring an owned element, using an accessible dialog portal or integrating an unavoidable third-party widget.

### Exception standard

A DOM bridge exception is allowed only when all of the following are true:

1. The target DOM is not owned by SIXFL React code or cannot reasonably be changed at source.
2. The exception is recorded by exact file path in `config/dom-bridge-exceptions.json`.
3. The record includes a concrete reason, named approver, restricted route scope and expiry date.
4. The code is narrowly scoped, idempotent, cleaned up on unmount and cannot run globally.
5. It does not control payments, fees, fixtures, player records, referee operations or other business-critical state.
6. A replacement or removal plan is documented.

Exceptions must be temporary and should normally expire within 90 days.

Existing legacy bridges are technical debt, not precedent. Do not expand their scope. When a legacy bridge is touched, replace it with native React/server rendering or add a valid temporary exception before merging.

Required checks:

```bash
npm run audit:dom
npm run audit:dom:changed
```

`audit:dom` reports the full legacy inventory. `audit:dom:changed` fails when changed source files add or modify suspicious DOM mutation without a valid exception.

## Critical feature contracts

A new feature must never silently remove an existing working feature.

- A change is complete only when the new behaviour works **and** all existing critical feature contracts for the affected area still pass after the full `npm run prebuild` chain.
- Never merge a pull request while the **SIXFL critical feature contracts** workflow is red.
- When a regression is fixed, add a permanent executable contract where practical so the same regression cannot silently return.
- Permanent business behaviour belongs in the React/Next.js/server source that owns it. Do not implement new permanent functionality solely through another `apply-*.cjs` source-rewriting patch.
- Existing `apply-*.cjs` scripts are compatibility debt. If a critical feature still depends on one, protect the final prepared source with a contract until the behaviour is moved natively.
- Any preparation script that preserves a protected critical feature must be idempotent when re-run after the complete prebuild. The wider legacy prebuild chain is technical debt and must be reduced rather than expanded.
- For kits, payments, players/squads, fixtures/results, league tables, player pool, previews and referee/night-board operations, inspect the existing contracts before changing the area and extend them when introducing a new invariant.

The policy and current protected behaviours are documented in `docs/critical-feature-contracts.md`.

Local verification for critical changes:

```bash
npm run prebuild
node scripts/check-critical-feature-contracts.mjs
```

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
