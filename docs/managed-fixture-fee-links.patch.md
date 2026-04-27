# Managed fixture fee links patch

Add two links in `src/components/admin/fixtures/FixturesAdminScreen.tsx`, inside the fixture row actions block, after the `Edit` button and before the delete form.

```tsx
{fixture.homeTeamId ? (
  <Link
    href={`/admin/teams/${fixture.homeTeamId}/match-fees?fixtureId=${fixture.id}`}
    className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/15"
  >
    Team 1 fees
  </Link>
) : null}

{fixture.awayTeamId ? (
  <Link
    href={`/admin/teams/${fixture.awayTeamId}/match-fees?fixtureId=${fixture.id}`}
    className="inline-flex h-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 text-xs font-semibold text-sky-200 transition hover:border-sky-300/30 hover:bg-sky-400/15"
  >
    Team 2 fees
  </Link>
) : null}
```

This links each fixture row to the existing player match fee tracker at `/admin/teams/[teamId]/match-fees?fixtureId=[fixtureId]`.
