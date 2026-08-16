import { prisma } from "@/lib/prisma";
import { queueLeadWelcomeNotifications } from "@/lib/notifications/transactional";

type MetaLeadWelcomeRow = {
  id: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  interestType: "TEAM" | "PLAYER" | "REFEREE";
  area: string | null;
  teamName: string | null;
  marketingConsent: boolean;
};

export async function queueMissingMetaLeadWelcomeEmails(limit = 100) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 500));
  const leads = await prisma.$queryRaw<MetaLeadWelcomeRow[]>`
    SELECT
      lead."id",
      lead."contactName",
      lead."email",
      lead."phone",
      lead."interestType"::text AS "interestType",
      lead."area",
      lead."teamName",
      lead."marketingConsent"
    FROM "InterestLead" lead
    WHERE lead."source" ILIKE 'Meta - %'
      AND lead."email" IS NOT NULL
      AND BTRIM(lead."email") <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM "NotificationDispatch" dispatch
        INNER JOIN "NotificationTemplate" template ON template."id" = dispatch."templateId"
        WHERE dispatch."sourceType" = 'interest-lead'
          AND dispatch."sourceId" = lead."id"
          AND template."key" IN ('lead-welcome-email', 'lead-team-waiting-list-email')
      )
    ORDER BY lead."createdAt" ASC
    LIMIT ${safeLimit}
  `;

  let queued = 0;
  let skipped = 0;

  for (const lead of leads) {
    try {
      await queueLeadWelcomeNotifications({
        lead,
        signupUrl: "https://www.sixfl.co.uk/register-interest",
        includeSms: false,
      });
      queued += 1;
    } catch (error) {
      skipped += 1;
      console.error(`Meta lead welcome email queue failed for ${lead.id}:`, error);
    }
  }

  return {
    checked: leads.length,
    queued,
    skipped,
  };
}
