# SIXFL team canonicalisation plan

This document is intentionally conservative. Do not delete or merge teams until the production audit has been reviewed.

## Root issue

`Team` currently carries permanent squad data and season/division placement fields. The intended model is:

- `Team` = permanent club/squad record.
- `LeagueSeasonTeam` = the team's membership of a season and division.
- Moving a team between divisions/seasons should create or update a `LeagueSeasonTeam` row, not create a new `Team` row.

The current mixed model can create duplicate `Team` records with the same name. Squad members, prospects, payments, fixtures and captain views can then point at different `Team.id` values.

## Current non-destructive audit

Run:

```bash
psql "$DATABASE_URL" -f scripts/audit-team-duplicates.sql
```

Or paste `scripts/audit-team-duplicates.sql` into the production database console.

The audit returns suspected duplicate groups and counts for:

- team members
- active squad prospects
- fixtures
- payment charges
- payment transactions
- player match fees
- fixture confirmations
- message threads
- result metadata
- result disputes
- season/division entries

The `suggestedCanonicalScore` is only a hint. The canonical team must be confirmed manually before any merge.

## Canonical team selection

Prefer the `Team.id` with:

1. real squad members and prospects;
2. captain claimed/linked state;
3. payment charges and payment transactions;
4. current season/division entry;
5. fixture history;
6. message threads and communications.

Do not choose the newest row automatically.

## Safe merge rules

Before any update, prepare a dry run showing the exact rows that would move from duplicate team IDs to the canonical team ID.

A merge must handle conflicts for:

- `TeamMember` unique `(userId, teamId)`
- `LeagueSeasonTeam` unique `(leagueId, teamId)`
- `PaymentCharge` unique `(fixtureId, teamId)`
- `FixtureCaptainConfirmation` unique `(fixtureId, teamId)`
- `MatchResultTeamMeta` unique `(matchResultId, teamId)`
- player match fees linked to `TeamMember` or `TeamPlayerProspect`
- fixtures where duplicate and canonical could become both home and away
- message threads and notification recipients

Do not cascade delete duplicate team rows. Add a `mergedIntoTeamId` marker or archive flag first, then resolve reads through a canonical helper.

## Code changes still required after audit

After the audit is reviewed:

1. Add `Team.mergedIntoTeamId`, `Team.mergedAt`, and possibly `Team.isMerged`.
2. Add `resolveCanonicalTeamId(teamId)`.
3. Use that helper in captain pages, squad actions, payments, fixtures, match fees, communications, and admin team pages.
4. Change team season/division assignment so `LeagueSeasonTeam` is the source of truth and `TeamMember` stays attached to the canonical `Team.id`.
5. Stop any code path that creates a new `Team` just to move a squad into a new season/division.

## Current status

This repo currently contains the read-only audit query only. No destructive migration has been added and no production data has been changed.
