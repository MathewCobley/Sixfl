# League News: explicit public publication

The private report workspace and old administrator-only weekly-report route stay
private. Anonymous news pages read only `LeagueNewsArticle` rows with PUBLISHED
status and a public allowlisted snapshot. They never read report drafts, revision
history, provider metadata, photo settings or omission explanations. Match IDs
link the actual current fixture teams; a stand-in team appearing twice keeps both
sections. This feature does not calculate standings.

Publishing creates one approved snapshot at `/leagues/[slug]/news/[date]`. The
league archive, public team news, captain/player teasers and sitemap all use the
same publication-only reader. Route-owned templates mount a small native
React discovery component on the league/team/captain/player landing only. Its
anonymous GET endpoint returns at most two published articles; child payment
and fixture screens are not decorated or delayed by news. Preview uses the identical article component but
requires administrator access and has noindex metadata. Preview cannot publish.

The existing authenticated same-origin JSON report endpoint owns settings,
publish and unpublish commands too. Draft version, live publication revision and
fresh source hash are checked server-side. Generation and draft edits keep their
original storage; they never rewrite live snapshots. The publication transaction
uses the same advisory lock as draft edits/generation, keeps a request audit,
rejects concurrent stale revisions and cannot replay an old publish to undo a
later unpublish. Repeated request IDs must match both actor and command fingerprint.

Photo settings are private until publication. An optional public photo URL, alt
text and caption are saved independently; changes do not change even the public
updated date before explicit publication. No new uploads, server-side arbitrary
URL fetches, paid AI calls, email/SMS alerts or social posting are triggered here.
Without a photograph the article uses SIXFL's branded editorial heading.

The additive idempotent migration creates empty publication tables. It never
publishes existing drafts. Unpublishing removes the article from direct anonymous
access, feeds and sitemap, retaining draft and audit history. Dynamic rendering
and targeted cache invalidation prevent serving the prior public snapshot from
the server after unpublish. Previously shared text or client screenshots cannot
be recalled.

Regression tests cover allowlisting, authorisation, preview, actual disposable
PostgreSQL publish/update/settings/unpublish/idempotency/concurrent writes,
team-linked feeds, sitemap removal, preserved old drafts, stale-source rejection,
existing report privacy, full prebuild integrations and real browser controls at
1440/390 pixels. No production article is published by tests or deployment.
