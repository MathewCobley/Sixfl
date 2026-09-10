# Matchday player-limit clarification — v2.4

Published wording applies from publication on 10 September 2026, not retrospectively.
The existing complaint about 9 September must remain an assessment under the rules
then in force. This change does not decide that complaint or amend a match result.

## Shared source and affected pages

`src/lib/matchday-player-limit-rules.ts` owns the participation definition,
publication note and cross-reference. Both active rule libraries import it. The
full discretionary sanction/review provision appears in League Rules section 4;
Match Rules, the referee guide, captain rules and captain guide cross-reference it.
Public document control and the admin rules archive use the central effective dates.

The limit remains six on the pitch including the goalkeeper, and nine different
participants over a whole fixture, including guests. Brief participation counts;
leaving, injury or substituting does not free a tenth participation place. Attendance
without participation does not count. An exception to nine requires SIXFL approval
for that fixture before the extra player participates; referee/opposition agreement
alone does not suffice. Either breach may attract a 3–0 forfeit, not automatically.
Evidence, a reasonable response opportunity and breaches by both teams are addressed.

## Historical integrity

The complete outgoing production-prepared League Rules and Match Rules v2.3 were
snapshotted from base 5061e943ce03b62dd6d990ef3498a6a1cdd1bf8e into
`src/lib/archived-player-limit-rules-v2-3.ts`, including the existing no-show rule
inserted by the legacy prebuild chain. Section fingerprints protect these fixed
snapshots. Earlier archive entries are not rewritten.

The outgoing Match Rules page displayed 22 August 2026 as its effective date despite
its v2.3 September label. The archive explicitly retains this discrepancy instead
of inventing a historical effective date. New v2.4 metadata is consistent.

## Verification and non-actions

Tests execute the actual rule modules and six owning pages with isolated I/O, before
and after the full production prebuild. They protect the discretionary wording,
non-retrospective notice, matching limits, old snapshots, unchanged unrelated rule
sections and historical captain acceptance wording. Browser checks inspect the
rendered public pages at desktop/mobile sizes; post-merge public verification makes
anonymous read-only GET requests to the two public rule pages.

No notification queue, customer email/SMS, captain reacceptance, financial change,
fixture/result action, migration or automated enforcement is added or invoked.
The operator will inform captains and referees separately. The temporary authoring
workflow is removed from the final change; all new behaviour is in native sources.
