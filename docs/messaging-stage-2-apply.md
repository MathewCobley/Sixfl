# Messaging Stage 2 apply guide

Use branch feature/messaging-webhooks-from-main.

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

## Environment variables

Required for email sending:
- RESEND_API_KEY
- EMAIL_FROM

Required for SMS sending:
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- one of TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER

Optional route protection:
- CRON_SECRET
- RESEND_WEBHOOK_SECRET
- TWILIO_WEBHOOK_SECRET

## What this follow-up does

- adds Resend webhook handling for sent/delivered/failed style events
- adds Twilio webhook handling for sent/delivered/failed style events
- records provider webhook outcomes back into notification attempts and dispatches

## What is still next

- confirm hosting routes and webhook secrets are configured
- register webhook endpoints with Resend and Twilio
- optionally add richer delivery reporting in admin UI
