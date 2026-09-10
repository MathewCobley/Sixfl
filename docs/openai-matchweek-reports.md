# Private OpenAI matchweek reports

Admin → Comms & media → Matchweek reports → choose a league and match night.
Generate report with OpenAI saves a real Responses API-generated article; Edit report / Save draft creates a new saved version. Reading a page or Check saved status never calls OpenAI or creates a draft. There is no publishing, emailing, SMS or automatic generation in this feature.

## Configuration

The existing server-side `OPENAI_API_KEY` is used. `OPENAI_MATCHWEEK_MODEL` optionally overrides `gpt-5.4-mini`. No SDK dependency or client-side key is added. One bounded provider call is made per claimed manual generation (65-second timeout, 6,000 output-token limit, no automatic retries or fallback prose). The Responses request uses strict JSON schema and `store: false`. This setting does not constitute a guarantee of zero provider-side retention.

## Evidence and editorial review

The entire selected London calendar night is supplied together, not a reused round number or arbitrary last 24 fixtures. Only published completed results are eligible. Cancelled/postponed, disputed, placeholder, abandonment and replacement fixtures are omitted and counted visibly. Scorer lists are checked against team goal totals, and contact-like name values are omitted. Only team names, scores, recorded scorer names and team-specific Player of the Match names are sent. No contact details, payment information, conduct notes or private administrative notes are selected. Incomplete nights are identified.

No standings/form claims are supplied: the central standings service does not currently provide a historical as-of snapshot. Do not add a second standings calculator. Report text must be reviewed by an administrator: structural/score validation does not prove every natural-language claim true. Input strings are treated as data; model output is rendered as React text, never HTML. A saved article uses its original score snapshot and displays a warning when current source facts differ.

## Persistence and safety

Two additive migration-owned raw-SQL extension tables (`MatchweekReportDraft` and `MatchweekReportRevision`) follow the existing SIXFL extension-table pattern. No runtime DDL or existing business-data edits. A draft is unique per league and match date. Saved versions are retained in revisions. PostgreSQL advisory locks, optimistic versions, request references and a two-minute generation lease prevent concurrent overwrites and duplicate provider calls. There is a 30-second cooldown per report and 50-generation daily limit per administrator. Failed generations retain the last saved draft. A timed-out request is not automatically retried. Use Check saved status after a lost response.

Page and API services use `requireAdmin()` before reads/writes. Browser actor identifiers are not accepted. Mutation routes additionally require same-origin JSON requests and an explicit custom header. All responses are private/no-store. Legacy public report bookmarks remain protected admin redirects; public navigation remains report-free.

## Tests

`node --test tests/admin-matchweek-reports.test.cjs tests/openai-matchweek-reports.test.cjs` covers native pages/navigation, the production authorization policy, provider request/response errors, score validation, London dates and DST, privacy minimisation and side-effect-free reads. CI additionally executes the real storage SQL against disposable PostgreSQL, including concurrent claims, stale saves/workers, duplicate requests, retained revisions and failure preservation, before and after the full prebuild chain. No real OpenAI key, production database or message provider is used in tests.
