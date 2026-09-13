import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentLeagueIds } from "@/lib/current-leagues";
import { CupInvitationError, type CupResponse, type CupTerms } from "./invitation-policy";
export type CupDb = Pick<typeof prisma, "$queryRaw" | "$executeRaw" | "user" | "team" | "league" | "teamMember" | "emailTemplate" | "notificationRecipient" | "notificationPreference" | "notificationTemplate" | "notificationDispatch">;
export type CupSettings = { cupLeagueId: string; matchFeePence: number; venueNote: string; scheduleNote: string; responseDeadline: Date; state: string; version: number; revision: number; termsHash: string };
export type Cup = { id: string; name: string; season: string | null; leagueType: string; cupFormat: string; isActive: boolean; isInterLeague: boolean; settings: CupSettings | null };
export type Invitation = { id: string; cupLeagueId: string; teamId: string; settingsVersion: number; terms: CupTerms; response: CupResponse; responseVersion: number; respondedAt: Date | null; respondedByName: string | null; lastReminderAt: Date | null; createdAt: Date };
export async function assertCupAdmin(actorId: string, db: CupDb = prisma) {
  const actor = actorId ? await db.user.findUnique({ where: { id: actorId }, select: { id: true, role: true, name: true } }) : null;
  if (actor?.role !== "ADMIN") throw new CupInvitationError("Administrator access is required.");
  return actor;
}
export async function loadCup(id: string, db: CupDb = prisma, lock = false): Promise<Cup> {
  const rows = await db.$queryRaw<Array<Omit<Cup,"settings">>>(Prisma.sql`
    SELECT l.id, c.name, l.season, c."leagueType"::text AS "leagueType", c."cupFormat", c."isInterLeague", (l."isActive" AND c."isActive") AS "isActive"
    FROM "League" l JOIN "LeagueCompetition" c ON c.id = l."competitionId"
    WHERE l.id = ${id} AND c."competitionType" = 'CUP' ${lock ? Prisma.sql`FOR UPDATE OF l` : Prisma.empty}
  `);
  if (!rows[0]) throw new CupInvitationError("Cup competition not found.");
  const settings = await db.$queryRaw<CupSettings[]>`SELECT * FROM "CupInvitationSettings" WHERE "cupLeagueId" = ${id}`;
  return { ...rows[0], settings: settings[0] ?? null };
}
export function cupTerms(cup: Cup): CupTerms {
  const s = cup.settings;
  if (!s) throw new CupInvitationError("Save the invitation details and a response deadline in Cup setup first.");
  return { cupName: cup.name, cupFormat: cup.cupFormat === "GROUPS_THEN_KNOCKOUT" ? "groups then knockout" : "straight knockout",
    matchFeePence: s.matchFeePence, venueNote: s.venueNote, scheduleNote: s.scheduleNote, responseDeadline: s.responseDeadline.toISOString() };
}
export function assertCupOpen(cup: Cup) {
  if (!cup.isActive || cup.settings?.state !== "OPEN" || new Date(cup.settings.responseDeadline) <= new Date())
    throw new CupInvitationError("Cup invitations are closed or the response deadline has passed.");
}
export async function loadInvitation(cupId: string, teamId: string, db: CupDb = prisma) {
  const rows = await db.$queryRaw<Invitation[]>`SELECT * FROM "CupInvitation" WHERE "cupLeagueId" = ${cupId} AND "teamId" = ${teamId}`;
  return rows[0] ?? null;
}
export async function isCupEntrant(cupId: string, teamId: string, db: CupDb = prisma) {
  const rows = await db.$queryRaw<Array<{id:string}>>`SELECT id FROM "LeagueSeasonTeam" WHERE "leagueId" = ${cupId} AND "teamId" = ${teamId} AND "isActive" = true`;
  return rows.length > 0;
}
export async function eligibleCupTeams(cup: Cup, db: CupDb = prisma) {
  const current = await getCurrentLeagueIds(null, db);
  if (!current.length) return [];
  return db.$queryRaw<Array<{ id: string; teamName: string; logoUrl: string | null; sourceLeagueId: string; sourceLeagueName: string }>>(Prisma.sql`
    SELECT DISTINCT ON (t.id) t.id, t.name AS "teamName", t."logoUrl", l.id AS "sourceLeagueId", l.name AS "sourceLeagueName"
    FROM "LeagueSeasonTeam" member JOIN "Team" t ON t.id = member."teamId" JOIN "League" l ON l.id = member."leagueId"
    WHERE member."isActive" = true AND member."leagueId" IN (${Prisma.join(current)}) AND l."leagueType"::text = ${cup.leagueType}
      AND COALESCE(t."isFixturePlaceholder", false) = false
    ORDER BY t.id, (l.id = t."leagueId") DESC, l."createdAt" DESC
  `);
}