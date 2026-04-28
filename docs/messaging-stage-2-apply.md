# Messaging Stage 2 apply guide

Use branch feature/resend-delivery-feedback-v2 for the latest Resend delivery feedback update.

## Added in this follow-up

- src/lib/notifications/webhooks.ts
- src/app/api/webhooks/resend/route.ts
- src/app/api/webhooks/twilio/route.ts
- docs/messaging-stage-2-apply.md

## What is already in main

- src/lib/notifications/providers/resend.ts
- src/lib/notifications/providers/twilio.ts
- src/lib/notifications/processor.ts
- src/lib/notifications/transactional.ts
- src/app/api/cron/notifications/route.ts
- src/lib/resend/verifyWebhook.ts

## Environment variables

Required for email sending:
- RESEND_API_KEY
- EMAIL_FROM

Required for Resend webhook verification:
- RESEND_WEBHOOK_SECRET

Required for SMS sending:
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- one of TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER

Optional route protection:
- CRON_SECRET
- TWILIO_WEBHOOK_SECRET

## What this follow-up does

- verifies Resend delivery webhooks using the signed `svix-*` headers
- handles Resend sent/delivered feedback
- handles Resend failed/bounced/complained/suppressed feedback
- handles Resend delivery delayed feedback
- records provider webhook outcomes back into notification attempts and dispatches
- updates outbound email message entries so the admin messaging view can show `SENT`, `DELIVERED`, `FAILED`, `BOUNCED`, `SUPPRESSED`, `COMPLAINED`, or `DELIVERY_DELAYED`
- marks recipients as suppressed when Resend reports `email.suppressed` or `email.complained`

## Production setup

Register this endpoint in Resend:

- `https://www.sixfl.co.uk/api/webhooks/resend`

Select the delivery events you want Resend to send. At minimum use:

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

## What is still next

- register the Resend webhook endpoint in the Resend dashboard
- confirm `RESEND_WEBHOOK_SECRET` is set in production
- test with one known email address and confirm the message status changes from `SENT` to `DELIVERED`
