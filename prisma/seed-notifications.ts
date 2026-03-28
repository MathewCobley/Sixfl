// ========================================
// File: prisma/seed-notifications.ts
// ========================================

import {
  NotificationAudience,
  NotificationChannel,
  NotificationTemplateKind,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();

async function upsertTemplate(input: {
  key: string;
  name: string;
  description?: string;
  kind?: NotificationTemplateKind;
  channel: NotificationChannel;
  audience: NotificationAudience;
  subject?: string | null;
  body: string;
  ctaLabel?: string | null;
  ctaUrlKey?: string | null;
}) {
  await prisma.notificationTemplate.upsert({
    where: { key: input.key },
    update: {
      name: input.name,
      description: input.description ?? null,
      kind: input.kind ?? NotificationTemplateKind.TRANSACTIONAL,
      channel: input.channel,
      audience: input.audience,
      subject: input.subject ?? null,
      body: input.body,
      ctaLabel: input.ctaLabel ?? null,
      ctaUrlKey: input.ctaUrlKey ?? null,
      isActive: true,
    },
    create: {
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind ?? NotificationTemplateKind.TRANSACTIONAL,
      channel: input.channel,
      audience: input.audience,
      subject: input.subject ?? null,
      body: input.body,
      ctaLabel: input.ctaLabel ?? null,
      ctaUrlKey: input.ctaUrlKey ?? null,
      isActive: true,
    },
  });
}

async function main() {
  await upsertTemplate({
    key: "lead-welcome-email",
    name: "Lead welcome email",
    description: "Initial welcome email for a new SIXFL lead.",
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.LEAD,
    subject: "Welcome to SIXFL, {{firstName}}",
    body: `Hi {{firstName}}

Thanks for getting in touch with SIXFL.

We have received your enquiry and we will be in touch shortly.

- Interest type: {{interestType}}
- Area: {{area}}
- Team: {{teamName}}

{{cta}}`,
    ctaLabel: "View SIXFL",
    ctaUrlKey: "signupUrl",
  });

  await upsertTemplate({
    key: "lead-welcome-sms",
    name: "Lead welcome SMS",
    description: "Initial welcome SMS for a new SIXFL lead.",
    channel: NotificationChannel.SMS,
    audience: NotificationAudience.LEAD,
    subject: null,
    body: "SIXFL: Hi {{firstName}}, thanks for your enquiry. We have got it and will be in touch shortly.",
  });

  await upsertTemplate({
    key: "fixture-change-email",
    name: "Fixture change email",
    description: "Transactional email for a fixture change.",
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: "Fixture updated: {{homeTeam}} vs {{awayTeam}}",
    body: `Hi {{firstName}}

Please note this fixture has changed.

- Match: {{homeTeam}} vs {{awayTeam}}
- New kickoff: {{kickoffTime}}
- Venue: {{venueName}}

{{cta}}`,
    ctaLabel: "View fixture",
    ctaUrlKey: "fixtureUrl",
  });

  await upsertTemplate({
    key: "fixture-change-sms",
    name: "Fixture change SMS",
    description: "Transactional SMS for a fixture change.",
    channel: NotificationChannel.SMS,
    audience: NotificationAudience.TEAM,
    subject: null,
    body: "SIXFL: Fixture updated - {{homeTeam}} vs {{awayTeam}}, {{kickoffTime}} at {{venueName}}. {{fixtureUrl}}",
  });

  console.log("Notification templates seeded.");
}

main()
  .catch((error) => {
    console.error("seed-notifications failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
