# Per-fixture matchnight report omissions

The existing `getReportSource` reader owns eligibility AND its explanation. It
returns one `skippedFixtures` item for each pending/omitted published fixture on
the selected London match date: fixture ID, sanitised teams, ISO kick-off,
pending/omitted disposition, and every applicable reason. Counts reconcile to
that list. Abandonment records still require editorial review; no narratives,
contacts or payment details are selected.

## Completed replacement games

A `LastMinuteReplacementResolution` record describes a successfully allocated
replacement, not an unresolved result. It is no longer queried or used as a report
blocker. Completed replacement fixtures are included using the current assigned
teams, saved scores and metadata for those teams. A replacement can appear in
more than one fixture on the same night; each fixture is reported separately.
All other checks remain: published selected-date fixtures only, completed status,
a saved valid score, no disputes, no abandonment, no future kick-off, and valid
non-placeholder teams. Replacement history never overrides any of those checks.
The reporting reader does not alter fixtures, results or replacement audit records.

`ReportSkippedFixtures` is rendered by the native admin `ReportEditor`, expanded
by default, above the article. It uses `view.source` (current data), not the saved
article snapshot. Fixture review links use the existing admin edit route and open
in a new tab to avoid discarding report edits. The read-only Check saved status
refreshes the list without a generation. No inclusion override is introduced.

Old snapshots remain valid: the optional review field is excluded from the
source hash, and legacy summary warning values remain internally for hash
compatibility. Their historic replacement label is not a current eligibility
rule and is not displayed. Included facts and omission counts still invalidate
stale articles. When newly eligible replacement games change a four-match source
to six, the existing draft is retained and marked stale. An administrator must
explicitly regenerate to include the extra matches in the article; refreshing
alone does not incur generation charges or rewrite saved editorial text.

The explicit OpenAI payload contains included fixture facts, not excluded-game
identities, administrative reasons, dropped-team details or payment information.
The permanent report workflow tests native and fully prepared classification,
all remaining blockers with replacement history, counts, current-team scorers,
two games by the same replacement team, old-draft preservation/staleness and the
six-result provider payload. Desktop/mobile tests exercise the four-to-six refresh
without POST requests. Existing auth, proxy and disposable PostgreSQL draft tests
remain. No production data, migration or customer message is changed.
