# SIXFL repository rules

## Email and SMS content

- All automated or administrator-triggered email and SMS subjects, bodies and CTA labels must be stored in `NotificationTemplate` and editable through the SIXFL System Templates interface.
- Application code may reference a stable template key and supply variables, recipient details, branding and metadata. It must not contain the final customer-facing subject or message body.
- Use `queueNotificationFromTemplate` for delivery. Do not add new direct `sendEmail` calls or `queueDirectNotification` calls for reusable system messages.
- Add new templates through an idempotent database migration so production receives them automatically. Preserve administrator edits when a template key already exists.
- A hard-coded message is acceptable only for an exceptional one-off diagnostic or security response that is not sent to customers; document the reason in code.
