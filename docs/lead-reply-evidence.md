# Lead replies: shared evidence and visible history

Admin lead details/edit layouts, automatic SMS status and the team-lead reminder job now use `loadLeadCommunicationEvidence` in `src/lib/leads/communication-evidence.ts`.

The resolver includes the old source-ID and lead-owned notification-recipient links, even for archived or legacy automation conversations. It does not search unrelated contacts by email/phone alone. Conflicting team/lead ownership is flagged for review rather than merged. Actual reply evidence requires an INBOUND contact entry, content and a matching lead or lead-owned recipient sender address. A cached timestamp alone is not proof.

The lead page starts with **Latest incoming reply**, actual message content, sender, channel and UK date/time, and a direct **View conversation** link using `filter=all&thread=...`. This bypasses the central inbox's default unread filter and 100-thread list. The timeline uses the same trusted conversation IDs. Latest-reply evidence is fetched independently of the timeline's 100-message-per-thread window and remains visible after many outgoing messages. Incoming entries show RECEIVED rather than a misleading sent-message explanation.

SMS status only says reply received with actual evidence. It includes the reply date/channel and a lead-page evidence URL. Unsupported timestamps and conflicting records say **Reply record needs checking**. They preserve existing automation holds; the read-time repair cannot restart a stopped chase. A question is not confirmation of a team place.

Historical records are resolved on read, not rewritten or copied, so the fix does not depend on another reminder being sent. No new migration, automatic resend, cron restart, reassignment or mark-read action is required. Existing queue timing, templates, payment and player workflows remain unchanged.

Tests use only a random localhost PostgreSQL schema and synthetic contacts. They execute the real resolver SQL, native panel/layout, status endpoint and reminder hold path after full production prebuild. The negative control removes the INBOUND filter and must fail. No customer message, contact or quote is included in test data.

Deployment and authenticated-production verification are reported separately in the pull request.
