import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminActivityItem } from "./latest-activity";

export type LeadDecisionActivityRow = {
  id: string;
  leadId: string;
  contactName: string;
  teamName: string | null;
  area: string | null;
  leagueName: string | null;
  season: string | null;
  outcome: "TEAM" | "PLAYER" | "DECLINED";
  occurredAt: Date;
};

// Existing player-choice submissions store DECLINED for the TEAM decision and
// preserve this audit note on the same lead. Require that evidence as well as
// PLAYER type: an unrelated manual type change must not become a player reply.
const PLAYER_CHOICE_EVIDENCE =
  "Contact chose individual-player interest instead of entering a team via their secure decision link.";

const clean = (value: string | null | undefined) => value?.trim().replace(/\s+/g, " ") || "";

export function presentLeadDecisionActivity(rows: LeadDecisionActivityRow[]): AdminActivityItem[] {
  const seen = new Set<string>();
  return rows.flatMap((row): AdminActivityItem[] => {
    if (!row.occurredAt || !Number.isFinite(row.occurredAt.getTime())) return [];
    if (!["TEAM", "PLAYER", "DECLINED"].includes(row.outcome)) return [];
    const id = `lead-decision:${row.id}:${row.outcome}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const contact = clean(row.contactName) || clean(row.teamName) || "Unnamed lead";
    const league = [clean(row.leagueName), clean(row.season)].filter(Boolean).join(" · ") || clean(row.area);
    // Passive team/decline wording is deliberate: older confirmation rows do
    // not identify the actor, and an administrator can record a decline too.
    const title = row.outcome === "TEAM"
      ? `Team entry confirmed · ${contact}`
      : row.outcome === "PLAYER"
        ? `${contact} chose to join as an individual player`
        : `No longer interested · ${contact}`;
    const detail = row.outcome === "TEAM"
      ? clean(row.teamName) || "Team name not decided yet"
      : row.outcome === "PLAYER"
        ? "Individual-player enquiry recorded — no team place assigned"
        : "Team-registration chasing stopped";
    return [{
      id, kind: "LEAD", title,
      detail: [league, detail].filter(Boolean).join(" · "),
      occurredAt: row.occurredAt,
      href: `/admin/leads/${encodeURIComponent(row.leadId)}`,
    }];
  });
}

/** Read-only projection of the existing decision source of truth. It includes
 * responses recorded before this feature without backfilling/replaying them.
 * Neither Qualified alone, an email send, a page view nor updatedAt is a reply.
 * The original confirmedAt/declinedAt is the activity time; one stable entry
 * represents each lead's currently saved decision, not each visit to its link.
 */
export async function getAdminLeadDecisionActivity(
  limit = 100,
  db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
): Promise<AdminActivityItem[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 100));
  const rows = await db.$queryRaw<LeadDecisionActivityRow[]>(Prisma.sql`
    SELECT * FROM (
      SELECT decision."id", lead."id" AS "leadId", lead."contactName",
        lead."teamName", lead."area", league."name" AS "leagueName", league."season",
        CASE
          WHEN decision."status"::text = 'CONFIRMED' THEN 'TEAM'
          WHEN decision."status"::text = 'DECLINED'
            AND lead."interestType"::text = 'PLAYER'
            AND POSITION(${PLAYER_CHOICE_EVIDENCE} IN COALESCE(lead."message", '')) > 0 THEN 'PLAYER'
          WHEN decision."status"::text = 'DECLINED'
            AND lead."interestType"::text = 'TEAM' THEN 'DECLINED'
          ELSE NULL
        END AS "outcome",
        CASE WHEN decision."status"::text = 'CONFIRMED'
          THEN decision."confirmedAt" ELSE decision."declinedAt" END AS "occurredAt"
      FROM "LeadTeamConfirmation" decision
      JOIN "InterestLead" lead ON lead."id" = decision."leadId"
      LEFT JOIN "League" league ON league."id" = lead."leagueId"
      WHERE decision."status"::text IN ('CONFIRMED', 'DECLINED')
    ) decisions
    WHERE decisions."outcome" IS NOT NULL AND decisions."occurredAt" IS NOT NULL
    ORDER BY decisions."occurredAt" DESC, decisions."id" ASC
    LIMIT ${safeLimit}
  `);
  return presentLeadDecisionActivity(rows);
}
