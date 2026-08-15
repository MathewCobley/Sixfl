# SIXFL Engineering Guardrails

These rules are here to protect the live SIXFL site and stop repeat mistakes.

## Production safety

- Never reset, wipe, or recreate the production database.
- Do not use destructive Prisma/database commands on live data.
- Prefer small, incremental changes over large rewrites.
- After changing route files, always check for route conflicts before pushing.

## Dynamic route slug naming

Use the existing lowercase route parameter names consistently.

### Team routes

Always use:

```text
[teamid]
```

For these route trees:

```text
src/app/captain/team/[teamid]
src/app/player/team/[teamid]
src/app/api/captain/team/[teamid]
src/app/api/player/team/[teamid]
```

Do not introduce sibling folders using:

```text
[teamId]
```

Next.js treats `[teamid]` and `[teamId]` as the same dynamic route level, but it will crash if both names exist under the same path. This caused the production error:

```text
You cannot use different slug names for the same dynamic path ('teamId' !== 'teamid').
```

Before adding or restoring any team route, search for both:

```text
[teamid]
[teamId]
```

and match the existing folder exactly.

## Captain / managed squad route conventions

Preferred patterns:

```text
/captain/team/[teamid]
/captain/team/[teamid]/squad
/captain/team/[teamid]/captain-squad
/captain/team/[teamid]/availability
/captain/team/[teamid]/match-fees
/player/team/[teamid]/availability
/api/captain/team/[teamid]/...
```

Admin preview / weaker captain views should not expose admin-only payment controls to normal captains.

## Admin implementation pattern

- Admin pages should remain under `src/app/(admin)/admin` or `src/app/admin` depending on the existing route tree.
- Protect admin server actions and pages with `requireAdmin()`.
- Protect captain team views/actions with `requireCaptain(teamid)`.
- Use the existing admin UI patterns and premium custom selectors; do not add native HTML selects to admin pages unless there is already a specific pattern requiring it.

## Regression checklist

Before changing admin, captain, player, squad, prospect, payment or fixture pages, check `docs/regression-checklist.md`.

Critical controls should be rendered directly by the page or by typed React components. Avoid relying on DOM-scanning bridge components for controls such as login status, player preview, player comms, send-login buttons, pending activation controls, payment actions or captain/player preview mode.

If a bridge component is still needed, it should be treated as temporary and must clearly depend on stable route/form selectors. Search for these before route/layout changes:

```text
MutationObserver
Bridge
querySelector
data-
/captain/team/
/admin/teams/
```

## Critical feature contracts

Compiling successfully is not proof that an existing SIXFL feature survived a change.

For business-critical areas, preserve behaviour with executable feature contracts. The contracts are run after the complete source-preparation chain, so they validate the code Railway will actually build.

Rules:

- new functionality must not remove an existing contract unless the product behaviour is deliberately being changed;
- a regression fix should leave behind a permanent contract where practical;
- do not merge while `.github/workflows/critical-feature-contracts.yml` is failing;
- permanent behaviour should live natively in the owning React/server source, not solely inside an `apply-*.cjs` build rewrite;
- any preparation script that preserves a protected critical feature must be idempotent when re-run after the complete prebuild; the wider legacy prebuild chain should be reduced rather than expanded;
- when changing a protected area, extend its contracts to cover any new invariant that would be costly to lose later.

See `docs/critical-feature-contracts.md` for the protected behaviours and expansion plan.

## Messaging and notification safety

- Notification/cron routes must return useful JSON errors where possible.
- Keep queue diagnostics available at `/admin/queue`.
- Do not mix contact/person conversations into team-level threads unless the thread is intentionally linked to that team.
- If a message thread is linked to the wrong team, use the reassign/unlink workflow rather than deleting messages.

## Build/check expectations

Before pushing route/API changes, do at least one of:

```text
npm run build
```

For changes to kits, payments, players/squads, fixtures/results, league tables, player pool, previews or referee/night-board operations, also run:

```text
npm run prebuild
node scripts/check-critical-feature-contracts.mjs
```

or, if build cannot be run, manually search for conflicting dynamic route folders such as:

```text
[teamId]
[teamid]
[fixtureId]
[fixtureid]
```

For the SIXFL app, do not create both camelCase and lowercase dynamic route folder names at the same URL level.
