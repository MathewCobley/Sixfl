# Managed-squad registration reminders

## Scope and source of truth

`src/lib/managed-squad/registration-reminders.ts` owns read-only eligibility inspection, transactional queue creation and last-moment provider guards. `registration-reminder-policy.ts` owns timing. The existing `/api/cron/notifications` runs the job between its original and generated queue drains; no additional Railway scheduler is required.

All MANAGED teams are included, regardless of recruiting toggle. Allocated prospects with NEW, CONTACTED, TRIAL or BACKUP status and a successfully SENT, team-owned squad activation invite qualify. This is squad activation, not optional profile-field completion or the separate PlayerPool form. Missing/failed original invitations need manual review. No account, membership, prospect status or consent is changed by this job.

## Sequence

One channel per stage: first SMS at invitation +24 hours; second email at +72 hours and at least 48 hours after the first reminder actually sent; final SMS at +7 days and at least 96 hours after the second actually sent. A permitted alternative channel is used when needed. An inactive/invalid template holds the message rather than silently switching templates. All automatic messages, including late delivery, respect 09:00–21:00 Europe/London and both clock changes.

Existing overdue invitations enter one stage at a time. Legacy manual invite chases consume the three-reminder cap; a legacy final ends the sequence. Manual contact postpones automation. Other queued contact messages block new chases. Failed/skipped/uncertain reminder attempts require queue review rather than endless retries. A per-prospect transaction lock and unique prospect/team/stage index prevent duplicate stages under concurrent runs.

## Stop conditions

The same eligibility checks run just before both providers: completed registration or existing membership, declined/inactive/unallocated/moved prospect, inactive league, reply received, suppression, changed contact/link/template, disabled channel or a completed sequence. Actual MessageEntry rows are used for replies, including archived conversations; cached timestamps alone are not treated as replies. Suppression and preferences are checked across matching recipient records. Duplicate pending email/phone records are held for review, never merged.

Late manual contact and quiet hours defer the existing outbox row. A reply, opt-out, stale link or closed prospect cancels it. Provider-accepted records are not made retryable. Existing manual invitation/YES-NO buttons remain; this feature does not schedule separate YES-NO nudges.

## Operations and verification

The admin and captain prospects layouts natively display Automatic registration reminders, with actual sent history, queued-not-sent schedules, and hold/review reasons. Rendering is read-only and remains behind requireAdmin/requireCaptain. `/admin/queue` remains the delivery diagnostic. Four transactional PLAYER templates are editable in System Templates; the migration preserves administrator edits and inactive settings.

Enabled by default when CRON_SECRET is present. Set MANAGED_SQUAD_REGISTRATION_REMINDERS_ENABLED=false to stop new work and cancel unsent automatic reminders at delivery. Each cron pass queues at most 25 reminders, paginating managed prospects without hard-coded teams. Cron JSON includes managedSquadRegistrationReminders; runtime summaries use [managed-squad-registration]. Do not manually call the full production cron for testing: it also runs other messages and payment work.

The dedicated PR workflow uses disposable localhost PostgreSQL, real queue/scheduler/processor code, stub email/SMS providers and the full production prebuild. Tests cover concurrency, index/template migration, timing/backlog, channel fallback, manual contact, all managed teams, replies/opt-outs/duplicates, identity preservation, provider cancellation, failures, quiet hours and native panel output. A negative control removes the provider gates and must fail tests. TypeScript, critical contracts and production build are required before merge. No real player messages or production data are used for testing.
