// ========================================
// File: src/lib/notifications/transactional.ts
// ========================================

import {
  InterestLead,
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { queueNotificationFromTemplate } from "./service";
import { upsertNotificationRecipient } from "./recipients";
import type { TeamEntryStatus } from "@/lib/leagues/entry-status";

function getLeadFirstName(contactName?: string | null) {
  return contactName?.trim().split(/\s+/)[0] || "there";
}

async function ensureTeamWaitingListLeadTemplates() {
  await Promise.all([
    prisma.notificationTemplate.upsert({
      where: { key: "lead-team-waiting-list-email" },
      update: {
        name: "Team lead waiting list email",
        description: "Welcome email for team leads when the selected league is full for team places.",
        kind: NotificationTemplateKind.TRANSACTIONAL,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.LEAD,
        subject: "SIXFL team waiting list — {{area}}",
        body: [
          "Hi {{firstName}},",
          "",
          "Thanks for registering your team with SIXFL.",
          "",
          "The current {{area}} league is now full for team places, so your team has been added to the waiting list.",
          "",
          "Player registrations are still open and we are also judging demand for extra places or another night. We will contact you if a place becomes available or if we launch another suitable league night.",
          "",
          "Team: {{teamName}}",
          "Area: {{area}}",
          "",
          "Thanks,",
          "SIXFL",
        ].join("\n"),
        ctaLabel: "View SIXFL",
        ctaUrlKey: "signupUrl",
        isActive: true,
      },
      create: {
        key: "lead-team-waiting-list-email",
        name: "Team lead waiting list email",
        description: "Welcome email for team leads when the selected league is full for team places.",
        kind: NotificationTemplateKind.TRANSACTIONAL,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.LEAD,
        subject: "SIXFL team waiting list — {{area}}",
        body: [
          "Hi {{firstName}},",
          "",
          "Thanks for registering your team with SIXFL.",
          "",
          "The current {{area}} league is now full for team places, so your team has been added to the waiting list.",
          "",
          "Player registrations are still open and we are also judging demand for extra places or another night. We will contact you if a place becomes available or if we launch another suitable league night.",
          "",
          "Team: {{teamName}}",
          "Area: {{area}}",
          "",
          "Thanks,",
          "SIXFL",
        ].join("\n"),
        ctaLabel: "View SIXFL",
        ctaUrlKey: "signupUrl",
        isActive: true,
      },
    }),
    prisma.notificationTemplate.upsert({
      where: { key: "lead-team-waiting-list-sms" },
      update: {
        name: "Team lead waiting list SMS",
        description: "Welcome SMS for team leads when the selected league is full for team places.",
        kind: NotificationTemplateKind.TRANSACTIONAL,
        channel: NotificationChannel.SMS,
        audience: NotificationAudience.LEAD,
        subject: null,
        body: "SIXFL: Hi {{firstName}}, the {{area}} league is currently full for teams, so your team has been added to the waiting list. Player registrations remain open.",
        ctaLabel: null,
        ctaUrlKey: null,
        isActive: true,
      },
      create: {
        key: "lead-team-waiting-list-sms",
        name: "Team lead waiting list SMS",
        description: "Welcome SMS for team leads when the selected league is full for team places.",
        kind: NotificationTemplateKind.TRANSACTIONAL,
        channel: NotificationChannel.SMS,
        audience: NotificationAudience.LEAD,
        subject: null,
        body: "SIXFL: Hi {{firstName}}, the {{area}} league is currently full for teams, so your team has been added to the waiting list. Player registrations remain open.",
        isActive: true,
      },
    }),
  ]);
}

export async function queueLeadWelcomeNotifications(input: {
  lead: Pick<
    InterestLead,
    | "id"
    | "contactName"
    | "email"
    | "phone"
    | "interestType"
    | "area"
    | "teamName"
    | "marketingConsent"
  >;
  signupUrl?: string;
  teamEntryStatus?: TeamEntryStatus | null;
}) {
  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.LEAD,
    sourceId: input.lead.id,
    audience: NotificationAudience.LEAD,
    displayName: input.lead.contactName,
    email: input.lead.email,
    phone: input.lead.phone,
    marketingEmailOptIn: input.lead.marketingConsent,
    marketingSmsOptIn: input.lead.marketingConsent,
    metadata: {
      interestType: input.lead.interestType,
      area: input.lead.area,
      teamName: input.lead.teamName,
      teamEntryStatus: input.teamEntryStatus ?? "OPEN",
    },
  });

  const teamWaitingList =
    input.lead.interestType === "TEAM" &&
    (input.teamEntryStatus === "WAITING_LIST" || input.teamEntryStatus === "CLOSED");

  if (teamWaitingList) {
    await ensureTeamWaitingListLeadTemplates();
  }

  const baseVariables = {
    firstName: getLeadFirstName(input.lead.contactName),
    interestType: input.lead.interestType,
    area: input.lead.area || "Not provided",
    teamName: input.lead.teamName || "Not provided",
    signupUrl: input.signupUrl || "https://www.sixfl.co.uk/register-interest",
  };

  const emailTemplateKey = teamWaitingList ? "lead-team-waiting-list-email" : "lead-welcome-email";
  const smsTemplateKey = teamWaitingList ? "lead-team-waiting-list-sms" : "lead-welcome-sms";

  const queued = [
    await queueNotificationFromTemplate({
      templateKey: emailTemplateKey,
      recipientId: recipient.id,
      sourceType: "interest-lead",
      sourceId: input.lead.id,
      variables: baseVariables,
      metadata: {
        event: teamWaitingList ? "lead.team_waiting_list.email" : "lead.welcome.email",
      },
    }),
  ];

  if (input.lead.phone?.trim()) {
    queued.push(
      await queueNotificationFromTemplate({
        templateKey: smsTemplateKey,
        recipientId: recipient.id,
        sourceType: "interest-lead",
        sourceId: input.lead.id,
        variables: baseVariables,
        metadata: {
          event: teamWaitingList ? "lead.team_waiting_list.sms" : "lead.welcome.sms",
        },
      }),
    );
  }

  return queued;
}
