# Fixture-specific guest permission

In full admin captain view, open **Matchday squad**, select the fixture and open it.
The native **Guest approvals** panel lets a SIXFL administrator search an existing
player by name or email, confirm the correct player/team/fixture, add an optional
internal note, and choose **Confirm guest approval**. No player pass is required
to record permission. Captains have a read-only list for their own team/fixture.

The badge is **Guest — SIXFL approved**. Approval records the admin, timestamp,
player and fixture. It does not change permanent registration, select a player,
create or waive a fee, or send notifications. The existing temporary-player and
payment workflows are unchanged. Approval does not replace player consent, count
as an appearance or override normal guest, squad-size or disciplinary rules.

## Revocation and audit

Before kick-off a full administrator may revoke permission with a reason. It is
shown as **Revoked — not approved**; existing selection and fees must be reviewed
separately. A later reapproval retains the previous decisions in the append-only
`FixtureGuestApprovalEvent` table. Past and non-scheduled fixtures are read-only;
this is not a retrospective permission/backdating tool.

Permissions are restricted to the exact fixture and receiving team, not future
fixtures. Writes recheck the admin role, fixture ownership, publication, status,
kick-off and record revision inside a transaction. The fixture row lock prevents
concurrent approvals from silently overwriting each other, including competing
approvals for both sides. Actor and decision are recorded atomically. Private
notes, player-search emails and admin identities are not exposed to captains.

## Regression checks

`fixture-guest-approvals.yml` runs the complete production prebuild followed by
real PostgreSQL tests in a newly created, isolated schema. It checks permissions,
preview restrictions, validation, atomic audit, concurrent/stale changes,
fixture scoping, revocation, and unchanged registrations/payments. It also checks
native layout/API wiring after prebuild and type-checks the application.
