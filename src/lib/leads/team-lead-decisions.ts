import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cancelUnsentTeamLeadChases } from "./team-lead-chases";

export type TeamLeadDeclineAudit = { actorUserId?: string; actorLabel?: string; via?: string; note?: string };

/** Existing confirmation + lead closure + cancellation + note commit together. No customer sends. */
export async function recordTeamLeadDecline(leadId: string, token: string, audit: TeamLeadDeclineAudit = {}) {
  const note = audit.note?.trim() || "";
  if (note.length > 2000) throw new Error("Please keep the reason to 2,000 characters or fewer.");
  return prisma.$transaction(async tx => {
    const [lead] = await tx.$queryRaw<Array<{ id: string; interestType: string; convertedTeamId: string | null; status: string }>>(Prisma.sql`
      SELECT "id", "interestType"::text AS "interestType", "convertedTeamId", "status"::text AS status
      FROM "InterestLead" WHERE "id" = ${leadId} FOR UPDATE
    `);
    if (!lead) throw new Error("Lead not found.");
    if (lead.interestType !== "TEAM") throw new Error("This action is for team enquiries only.");
    if (lead.convertedTeamId) throw new Error("This enquiry has already become a team. Manage that team's participation instead.");
    const [prior] = await tx.$queryRaw<Array<{ status: string; declinedAt: Date | null }>>(Prisma.sql`
      SELECT "status"::text AS status, "declinedAt" FROM "LeadTeamConfirmation" WHERE "leadId" = ${leadId}
    `);
    const alreadyDeclined = prior?.status === "DECLINED" && lead.status === "CLOSED";
    const now = new Date();
    const declinedAt = prior?.status === "DECLINED" && prior.declinedAt ? prior.declinedAt : now;
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "LeadTeamConfirmation" ("id", "leadId", "token", "status", "declinedAt", "createdAt", "updatedAt")
      VALUES (${`cltc_${randomUUID()}`}, ${leadId}, ${token}, 'DECLINED', ${declinedAt}, ${now}, ${now})
      ON CONFLICT ("leadId") DO UPDATE SET "status" = 'DECLINED', "declinedAt" = EXCLUDED."declinedAt",
        "confirmedAt" = NULL, "updatedAt" = EXCLUDED."updatedAt"
    `);
    const actor = audit.actorUserId
      ? `${audit.actorLabel?.trim() || "Administrator"} [admin ${audit.actorUserId}]`
      : "Team contact (secure decision link)";
    const stamp = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short",
    }).format(now);
    const entry = `[${stamp} UK] Not interested — registration chases stopped. Recorded by ${actor}. Via ${audit.via || "WEBSITE"}.${note ? ` Reason: ${note}` : ""}`;
    await tx.$executeRaw(Prisma.sql`
      UPDATE "InterestLead" SET "status" = 'CLOSED', "closedAt" = COALESCE("closedAt", ${now}), "updatedAt" = ${now},
        "message" = CASE WHEN ${alreadyDeclined} THEN "message"
          ELSE CONCAT_WS(E'\n\n', NULLIF("message", ''), ${entry}) END
      WHERE "id" = ${leadId}
    `);
    const cancellation = await cancelUnsentTeamLeadChases(leadId, tx);
    return { alreadyDeclined, declinedAt: declinedAt.toISOString(), ...cancellation };
  });
}
