# Abandonment fee override

The default team-responsible abandonment and confirmed-no-show rules remain unchanged. An explicit, server-verified administrator decision may keep existing fees unchanged, with a required reason stored alongside the original incident, actor and time. This mode must not write team charges, player fees, receipts, credits, waivers, refunds or existing payment reminders. Responsibility and the official MatchResult decision remain separate.

The shared abandonment service owns the financial branch. Both initial notices and explicit email recovery read the persisted decision and use the editable unchanged-fee System Template; a delivery failure must never fall back to double-fee or waived-fee copy. Later charge sync must not void/reprice this pending-result abandonment, and the shared player-account reader preserves collection eligibility without reopening paid, waived or cancelled player fees. Ordinary cancellations/postponements retain their safeguards.

`tests/abandonment-fee-override.test.cjs` runs the real service and charge sync against disposable PostgreSQL after the complete prebuild chain, comparing full financial snapshots, plus default-rule, rollback, duplicate submission, permission, rendering, template and recovery checks. It blocks provider HTTP and never uses production data.
