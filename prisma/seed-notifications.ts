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
  const existing = await prisma.notificationTemplate.findUnique({
    where: { key: input.key },
    select: {
      id: true,
      subject: true,
      body: true,
      ctaLabel: true,
      ctaUrlKey: true,
    },
  });

  if (existing) {
    await prisma.notificationTemplate.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        description: input.description ?? null,
        kind: input.kind ?? NotificationTemplateKind.TRANSACTIONAL,
        channel: input.channel,
        audience: input.audience,
        subject: existing.subject ?? input.subject ?? null,
        body: existing.body || input.body,
        ctaLabel: existing.ctaLabel ?? input.ctaLabel ?? null,
        ctaUrlKey: existing.ctaUrlKey ?? input.ctaUrlKey ?? null,
        isActive: true,
      },
    });

    return;
  }

  await prisma.notificationTemplate.create({
    data: {
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

  await upsertTemplate({
    key: "fixture-publish-digest-email",
    name: "Fixture publish digest email",
    description: "Automated email sent when a league's fixtures are published.",
    kind: NotificationTemplateKind.TRANSACTIONAL,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: "{{leagueName}} fixtures are live",
    body: `Hi {{firstName}}

Your fixtures for {{leagueDisplayName}} are now live.

{{fixturesList}}

You will also receive automatic reminders before kickoff.

{{cta}}`,
    ctaLabel: "View fixtures",
    ctaUrlKey: "fixturesUrl",
  });

  await upsertTemplate({
    key: "fixture-reminder-email",
    name: "Fixture reminder email",
    description: "Automated reminder email before kickoff.",
    kind: NotificationTemplateKind.TRANSACTIONAL,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: "{{leagueName}} fixture reminder",
    body: `Hi {{firstName}}

Reminder: {{fixtureName}}
Kickoff: {{kickoffLabel}}

Please make sure your team is ready for kickoff.

{{cta}}`,
    ctaLabel: "View fixtures",
    ctaUrlKey: "fixturesUrl",
  });

  await upsertTemplate({
    key: "match-fee-due-email",
    name: "Match fee due email",
    description: "Automated email sent when a match fee charge is raised.",
    kind: NotificationTemplateKind.TRANSACTIONAL,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: "{{leagueName}} match fee due",
    body: `Hi {{firstName}}

A match fee has been raised for your SIXFL fixture.

Fixture: {{fixtureName}}
Kickoff: {{kickoffLabel}}
Amount due: {{amount}}

Payment is normally settled after the match. If the charge is still unpaid, SIXFL will automatically send reminder emails 24 hours and 72 hours after kickoff.

Use the secure payment link below to review the charge and pay online.

{{cta}}`,
    ctaLabel: "Review & pay match fee",
    ctaUrlKey: "paymentUrl",
  });

  await upsertTemplate({
    key: "match-fee-reminder-email",
    name: "Match fee reminder email",
    description: "Automated reminder email for an unpaid match fee.",
    kind: NotificationTemplateKind.TRANSACTIONAL,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: "{{leagueName}} match fee reminder",
    body: `Hi {{firstName}}

{{reminderIntro}}

Fixture: {{fixtureName}}
Kickoff: {{kickoffLabel}}

Please use the secure payment link below to review the charge and pay the outstanding balance.

{{cta}}`,
    ctaLabel: "Review & pay match fee",
    ctaUrlKey: "paymentUrl",
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
