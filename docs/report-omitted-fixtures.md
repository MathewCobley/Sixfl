# Per-fixture matchnight report omissions

The existing `getReportSource` reader owns eligibility AND its explanation. It
returns one `skippedFixtures` item for each pending/omitted published fixture on
the selected London match date: fixture ID, sanitised teams, ISO kick-off,
pending/omitted disposition, and every applicable reason. Counts reconcile to
that list. The administrative query now labels abandonment and replacement
records separately; no narratives, contacts or payment details are selected.

`ReportSkippedFixtures` is rendered by the native admin `ReportEditor`, expanded
by default, above the article. It uses `view.source` (current data), not the saved
article snapshot. Fixture review links use the existing admin edit route and open
in a new tab to avoid discarding report edits. The read-only Check saved status
refreshes the list without a generation. No inclusion override is introduced.

Old snapshots remain valid: the new optional review field is excluded from the
source hash, and legacy summary warning values remain internally for hash
compatibility. The editor no longer displays the generic catch-all warning.
Included facts and omission counts still invalidate genuinely stale articles.
The existing explicit OpenAI payload does NOT include omitted fixture identities
or administrative reasons. No automatic generation or paid request is made.

The permanent report workflow tests native and fully prepared classification
against the former eligibility rules, every omission category, multiple reasons,
counts, data minimisation, hash compatibility, legacy and saved-draft rendering,
provider payload filtering and real editor desktop/mobile refresh interactions.
Existing auth, proxy and disposable PostgreSQL draft transaction tests remain.
No production fixture, result, payment, draft or notification data is changed.
