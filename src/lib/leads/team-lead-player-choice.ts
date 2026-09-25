import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cancelUnsentTeamLeadChases } from "./team-lead-chases";
import { verifyTeamPlaceConfirmationToken } from "./teamPlaceConfirmation";

export class TeamLeadPlayerChoiceError extends Error {
  constructor(public readonly code: "invalid" | "unavailable") {
    super(code === "invalid" ? "This decision link is not valid." : "This enquiry cannot be changed to a player enquiry online.");
    this.name = "TeamLeadPlayerChoiceError";
  }
}

export type PlayerChoiceLead = {
  interestType: string;
  status: string;
  convertedTeamId: string | null;
  convertedAt: Date | null;
  confirmationStatus: string | null;
};

/** A positive team commitment must never be silently undone by an old email. */
export function canChooseIndividualPlayer(lead: PlayerChoiceLead) {
  return lead.interestType === "TEAM" &&
    (lead.status === "NEW" || lead.status === "CONTACTED") &&
    !lead.convertedTeamId && !lead.convertedAt &&
    (!lead.confirmationStatus || lead.confirmationStatus === "PENDING");
}

/** Called only after an explicit POST, never while rendering/opening the email.
 * Keep the same lead ID, contact details, consent, prospective league and history.
 * This registers player INTEREST; it never creates an account, team or payment.
 */
export async function recordIndividualPlayerChoice(token: string) {
  const leadId = verifyTeamPlaceConfirmationToken(token);
  if (!leadId) throw new TeamLeadPlayerChoiceError("invalid");

  return prisma.$transaction(async tx => {
    // The same lead row is locked by team decisions; competing choices serialize.
    const [lead] = await tx.$queryRaw<Array<PlayerChoiceLead & { id: string }>>(Prisma.sql`
      SELECT "id", "interestType"::text AS "interestType", "status"::text AS status,
        "convertedTeamId", "convertedAt"
      FROM "InterestLead" WHERE "id" = ${leadId} FOR UPDATE
    `);
    if (!lead) throw new TeamLeadPlayerChoiceError("invalid");

    // Retrying the same signed choice does not duplicate the enquiry or its note,
    // and must not reopen a player enquiry already processed by SIXFL.
    if (lead.interestType === "PLAYER" && !lead.convertedTeamId) {
      return { leadId, alreadyRecorded: true };
    }

    const [confirmation] = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
      SELECT "status"::text AS status FROM "LeadTeamConfirmation" WHERE "leadId" = ${leadId}
    `);
    if (!canChooseIndividualPlayer({ ...lead, confirmationStatus: confirmation?.status ?? null })) {
      throw new TeamLeadPlayerChoiceError("unavailable");
    }

    const now = new Date();
    const stamp = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short",
    }).format(now);
    const note = `[${stamp} UK] Contact chose individual-player interest instead of entering a team via their secure decision link. Original enquiry, contact details and prospective league retained; team registration chases stopped. No squad place or player account created.`;

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "LeadTeamConfirmation" ("id", "leadId", "token", "status", "declinedAt", "createdAt", "updatedAt")
      VALUES (${`cltc_${randomUUID()}`}, ${leadId}, ${token.trim()}, 'DECLINED', ${now}, ${now}, ${now})
      ON CONFLICT ("leadId") DO UPDATE SET "status" = 'DECLINED', "confirmedAt" = NULL,
        "declinedAt" = EXCLUDED."declinedAt", "updatedAt" = EXCLUDED."updatedAt"
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "InterestLead" SET "interestType" = 'PLAYER', "status" = 'NEW', "closedAt" = NULL,
        "updatedAt" = ${now}, "message" = CONCAT_WS(E'\n\n', NULLIF("message", ''), ${note})
      WHERE "id" = ${leadId}
    `);
    // Exact lead/purpose only. Accepted/in-flight provider messages are not
    // relabelled as unsent; the existing final provider gate rejects non-team leads.
    const cancellation = await cancelUnsentTeamLeadChases(leadId, tx);
    return { leadId, alreadyRecorded: false, ...cancellation };
  });
}
