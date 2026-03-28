# Messaging Stage 1 apply guide

Use branch feature/messaging-stage-1-apply.

Files added on this branch:
- src/lib/notifications/renderer.ts
- src/lib/notifications/recipients.ts
- src/lib/notifications/service.ts
- src/lib/notifications/index.ts
- prisma/seed-notifications.ts
- prisma/schema.stage1-notifications.prisma

You still need to copy the schema block from prisma/schema.stage1-notifications.prisma into prisma/schema.prisma locally.

Then run:
- npx prisma migrate dev --name add_notification_core_stage1
- npx prisma generate
- npx tsx prisma/seed-notifications.ts

This stage is additive and does not replace the current lead email flow yet.
