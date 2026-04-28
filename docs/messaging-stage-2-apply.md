# Messaging Stage 2 apply guide

This guide covers the live messaging/webhook setup for SIXFL.

## Webhook routes

- Resend delivery feedback: `/api/webhooks/resend`
- Twilio delivery feedback: `/api/webhooks/twilio`
- Notification worker/cron: `/api/cron/notifications`

## Environment variables

Required for email sending:

- `RESEND_API_KEY`
- `EMAIL_FROM`

Required for Resend webhook verification:

- `RESEND_WEBHOOK_SECRET`

Required for SMS sending:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- one of `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_PHONE_NUMBER`

Optional route protection:

- `CRON_SECRET`
- `TWILIO_WEBHOOK_SECRET`

## Resend production setup

Register this endpoint in Resend:

- `https://www.sixfl.co.uk/api/webhooks/resend`

Enable at least these events:

- `email.sent`
- `email.delivered`
- `email.delivery_delayed`
- `email.bounced`
- `email.failed`
- `email.suppressed`
- `email.complained`

Optional engagement events:

- `email.opened`
- `email.clicked`

Copy the webhook signing secret from Resend into production as `RESEND_WEBHOOK_SECRET`.

## What Resend feedback updates

- verifies Resend delivery webhooks using the signed `svix-*` headers
- records sent/delivered feedback
- records failed/bounced/complained/suppressed feedback
- records delivery delayed feedback
- updates outbound email message entries with statuses such as `SENT`, `DELIVERED`, `FAILED`, `BOUNCED`, `SUPPRESSED`, `COMPLAINED`, or `DELIVERY_DELAYED`
- marks recipients as suppressed when Resend reports `email.suppressed` or `email.complained`

## Manual sends

Manual admin sends should process immediately after being queued. Scheduled sends, fixture reminders, payment reminders, and quiet-hours SMS are intentionally left queued until their scheduled send time.
