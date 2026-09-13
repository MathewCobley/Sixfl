import { Prisma } from "@prisma/client";
import { queueDirectNotification } from "@/lib/notifications/service";
import type { CupDb } from "./invitation-data";

export async function queueCupCampaignEmail(input: {
  recipientId: string;
  subject: string | null;
  body: string;
  variables: Prisma.InputJsonValue;
  emailCta?: { label: string; url: string };
  sourceType: string;
  sourceId: string;
  metadata: Prisma.InputJsonValue;
  createdByUserId: string;
}, db: CupDb) {
  return queueDirectNotification({
    recipientId: input.recipientId,
    channel: "EMAIL",
    audience: "TEAM",
    subject: input.subject,
    body: input.body,
    isTransactional: true,
    variables: input.variables,
    emailCta: input.emailCta,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    metadata: input.metadata,
    createdByUserId: input.createdByUserId,
  }, db);
}
