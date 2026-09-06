# Closed replacement-request SMS

When a last-minute replacement is allocated, SMS that has not been submitted to the provider must no longer be sent for that request. This applies to the original available-fixture alert and every resolved-request SMS role: not selected, selected replacement and opponent. Existing email confirmations and closure emails are unaffected. Unrelated payment, squad, player, referee and ordinary fixture messages are out of scope.

`src/lib/fixtures/replacement-sms-lifecycle.ts` is the shared policy. It matches the two exact last-minute replacement origin values and the fixture/drop-team metadata, never visible message text or a team name. An open, published future fixture still allows its original alert; a persisted resolution, changed participating teams, expired/deleted/unpublished fixture or resolved-origin follow-up blocks an SMS.

The policy is used by both notification queue creation paths and rechecked immediately before Twilio in the shared processor. `getDueNotificationDispatches` sweeps even future-dated queued messages before fetching the due batch. Shared Night Board/cron replacement reconciliation also runs the cleanup, including already-resolved requests. An unrelated cleanup error is logged without stranding the entire queue; the individual replacement delivery check still fails closed.

`QUEUED` and failed-but-unsent rows are cancelled, not hard-deleted. The reason, timestamp, previous status and communications history are retained, while cancelled records are excluded from sendable queues. The stored previous status prevents cancelling a failed attempt from accidentally adding a new recipient to the email closure process. New queue-time-blocked SMS are not counted as previously contacted teams.

A bulk sweep never relabels `PROCESSING`, sent records, or records with provider acceptance evidence in the dispatch, attempt or linked message history. The owning worker may cancel its own claimed row before submitting it. Messages already handed to the provider cannot be recalled by this application change; the final pre-send check reduces stale-batch races but is not a provider-side recall mechanism.

Migration `20260906225000_cancel_resolved_replacement_sms` cleans existing obsolete queues on rollout. It sends nothing, requeues nothing, and leaves email, unrelated SMS, successful delivery evidence, original body text, fixtures and payments unchanged. Re-running it preserves already-cancelled audit values.

The isolated PostgreSQL regression suite uses the real policy, queue functions and processor with mocked providers. It covers quiet-hours queues, offer plus all follow-ups, migration/runtime parity and replay, exact request scope, protected delivery evidence, allocation after claim, and unchanged valid/unrelated SMS. Full production prebuild and the existing critical/fixture contracts are required before merge. Deployment/migration success is separate from inspecting the authenticated live SMS queue.
