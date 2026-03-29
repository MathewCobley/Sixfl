// ========================================
// File: src/lib/notifications/transactional.ts
// ========================================

import {
    InterestLead,
    NotificationAudience,
    NotificationRecipientSourceType,
  } from "@prisma/client";
  import { queueNotificationFromTemplate } from "./service";
  import { upsertNotificationRecipient } from "./recipients";
  
  function getLeadFirstName(contactName?: string | null) {
    return contactName?.trim().split(/\s+/)[0] || "there";
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
      },
    });
  
    const baseVariables = {
      firstName: getLeadFirstName(input.lead.contactName),
      interestType: input.lead.interestType,
      area: input.lead.area || "Not provided",
      teamName: input.lead.teamName || "Not provided",
      signupUrl: input.signupUrl || "https://www.sixfl.co.uk/register-interest",
    };
  
    const queued = [
      await queueNotificationFromTemplate({
        templateKey: "lead-welcome-email",
        recipientId: recipient.id,
        sourceType: "interest-lead",
        sourceId: input.lead.id,
        variables: baseVariables,
        metadata: {
          event: "lead.welcome.email",
        },
      }),
    ];
  
    if (input.lead.phone?.trim()) {
      queued.push(
        await queueNotificationFromTemplate({
          templateKey: "lead-welcome-sms",
          recipientId: recipient.id,
          sourceType: "interest-lead",
          sourceId: input.lead.id,
          variables: baseVariables,
          metadata: {
            event: "lead.welcome.sms",
          },
        }),
      );
    }
  
    return queued;
  }