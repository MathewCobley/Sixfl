# Messaging Stage 2 apply guide

Use branch feature/messaging-stage-2-apply.

## Added in stage 2

- src/lib/notifications/providers/resend.ts
- src/lib/notifications/providers/twilio.ts
- src/lib/notifications/processor.ts
- src/lib/notifications/transactional.ts
- src/lib/notifications/webhooks.ts
- src/app/api/cron/notifications/route.ts
- src/app/api/webhooks/resend/route.ts
- src/app/api/webhooks/twilio/route.ts

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

## What this stage does

- processes queued notifications through a cron route
- sends email through Resend
- sends SMS through Twilio using fetch, so no extra dependency is required
- records provider outcomes back into notification dispatches and attempts
- adds a transactional helper for queued lead welcome notifications

## What is still next

- bridge the lead create flow into queueLeadWelcomeNotifications
- admin messaging screens
- bulk campaign UI and safeguards
- richer delivery reporting
