import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveTeamFixtureFeePence } from '@/lib/payments/fixture-fee-policy';
import { allocateVeoNight, veoFee, type VeoFixture, type VeoHistory, type VeoSettings } from './allocator';

type Db = Prisma.TransactionClient;
export class VeoAllocationError extends Error {}
export type LeagueVeoSettings = VeoSettings & { revision: number };
export type VeoTeam = { id: string; name: string; teamMode: string; standardMatchFeePence: number | null; priority: boolean };
export type VeoNightFixture = VeoFixture & {
  kickoffAt: Date; homeName: string; awayName: string; publishedAt: Date | null;
  homeMatchFeePence: number | null; awayMatchFeePence: number | null; matchFeePence: number | null;
  homeStandard: number | null; awayStandard: number | null; sixflTvUrl: string | null;
};
export function londonVeoDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function validVeoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export async function readVeoSettings(leagueId: string, db: Db = prisma): Promise<LeagueVeoSettings> {
  const rows = await db.$queryRaw<LeagueVeoSettings[]>`
    SELECT "enabled", "pitch", "venueId", "maxMatches", "revision" FROM "VeoLeagueSettings" WHERE "leagueId" = ${leagueId}
  `;
  return rows[0] ?? { enabled: false, pitch: '', venueId: null, maxMatches: 3, revision: 0 };
}
export async function readVeoTeams(leagueId: string, db: Db = prisma): Promise<VeoTeam[]> {
  return db.$queryRaw<VeoTeam[]>`
    SELECT t.id, t.name, t."teamMode"::text AS "teamMode", t."standardMatchFeePence",
      COALESCE(p.enabled, false) AS priority
    FROM "Team" t LEFT JOIN "VeoTeamPriority" p ON p."teamId" = t.id AND p."leagueId" = ${leagueId}
    WHERE NOT t."isFixturePlaceholder" AND (t."leagueId" = ${leagueId} OR EXISTS (
      SELECT 1 FROM "Fixture" f WHERE f."leagueId" = ${leagueId} AND f."kickoffAt" > NOW() AT TIME ZONE 'UTC'
      AND (f."homeTeamId" = t.id OR f."awayTeamId" = t.id)
    )) ORDER BY t.name, t.id
  `;
}
export async function readVeoNight(leagueId: string, date: string, db: Db = prisma): Promise<VeoNightFixture[]> {
  if (!validVeoDate(date)) throw new VeoAllocationError('Choose a valid match date.');
  const rows = await db.$queryRaw<(Omit<VeoNightFixture, 'kickoffMs'>)[]>`
    SELECT f.id, f."kickoffAt", f."venueId", f.pitch, f."homeTeamId", f."awayTeamId", f."publishedAt",
      f."homeMatchFeePence", f."awayMatchFeePence", f."matchFeePence", f."sixflTvUrl",
      h.name AS "homeName", a.name AS "awayName", h."standardMatchFeePence" AS "homeStandard", a."standardMatchFeePence" AS "awayStandard",
      COALESCE(NULLIF(l."minutesPerGame", 0), 40) AS "durationMinutes",
      (COALESCE(hp.enabled, false) AND h."teamMode"::text = 'STANDARD') AS "homePriority",
      (COALESCE(ap.enabled, false) AND a."teamMode"::text = 'STANDARD') AS "awayPriority",
      (NOT h."isFixturePlaceholder" AND NOT a."isFixturePlaceholder" AND h.id <> a.id AND f.status::text = 'SCHEDULED') AS eligible,
      (f."publishedAt" IS NOT NULL OR f."kickoffAt" <= NOW() AT TIME ZONE 'UTC' OR f.status::text <> 'SCHEDULED'
       OR f."sixflTvRecorded" OR EXISTS (SELECT 1 FROM "VeoFixtureSnapshot" s WHERE s."fixtureId" = f.id)
       OR EXISTS (SELECT 1 FROM "PaymentCharge" c WHERE c."fixtureId" = f.id)
       OR EXISTS (SELECT 1 FROM "PlayerMatchFee" c WHERE c."fixtureId" = f.id)) AS locked,
      f."sixflTvRecorded" AS filmed
    FROM "Fixture" f JOIN "League" l ON l.id = f."leagueId"
      JOIN "Team" h ON h.id = f."homeTeamId" JOIN "Team" a ON a.id = f."awayTeamId"
      LEFT JOIN "VeoTeamPriority" hp ON hp."leagueId" = f."leagueId" AND hp."teamId" = h.id
      LEFT JOIN "VeoTeamPriority" ap ON ap."leagueId" = f."leagueId" AND ap."teamId" = a.id
    WHERE f."leagueId" = ${leagueId}
      AND to_char(f."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') = ${date}
      AND f.status::text NOT IN ('CANCELLED', 'POSTPONED')
    ORDER BY f."kickoffAt", f.id
  `;
  return rows.map(row => ({ ...row, kickoffMs: row.kickoffAt.getTime() }));
}
async function readVeoHistory(leagueId: string, beforeDate: string, db: Db): Promise<VeoHistory> {
  const rows = await db.$queryRaw<{ teamId: string; count: number; last: Date }[]>`
    SELECT side."teamId", COUNT(*)::integer AS count, MAX(f."kickoffAt") AS last
    FROM "Fixture" f CROSS JOIN LATERAL (VALUES (f."homeTeamId"), (f."awayTeamId")) AS side("teamId")
    WHERE f."leagueId" = ${leagueId} AND f."sixflTvRecorded" AND f.status::text NOT IN ('CANCELLED', 'POSTPONED')
      AND to_char(f."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') < ${beforeDate}
    GROUP BY side."teamId"
  `;
  return Object.fromEntries(rows.map(row => [row.teamId, { count: row.count, lastMs: row.last.getTime() }]));
}
export async function previewVeoNight(leagueId: string, date: string, db: Db = prisma) {
  const settings = await readVeoSettings(leagueId, db);
  const fixtures = await readVeoNight(leagueId, date, db);
  const history = await readVeoHistory(leagueId, date, db);
  try {
    return { settings, fixtures, choices: allocateVeoNight(fixtures, settings, history) };
  } catch (error) {
    throw new VeoAllocationError(error instanceof Error ? error.message : 'Unable to allocate the Veo pitch.');
  }
}
export function quoteVeoFixture(f: VeoNightFixture, allocated: boolean) {
  return {
    home: veoFee(resolveTeamFixtureFeePence(f.homeMatchFeePence, f.homeStandard, f.matchFeePence), f.homePriority, allocated),
    away: veoFee(resolveTeamFixtureFeePence(f.awayMatchFeePence, f.awayStandard, f.matchFeePence), f.awayPriority, allocated),
  };
}
/** Called BEFORE publication reads the prices, in its SAME serializable transaction.
 * Missing settings = OFF. No external calls, charge creation or messaging occurs here.
 * A rollback undoes the swaps, snapshots, fee changes and publication together.
 */
export async function prepareVeoPublication(db: Db, scope: { leagueId: string; round?: number; divisionId?: string | null }) {
  // Settings changes and parallel publishes serialize on the same existing league row.
  await db.$queryRaw`SELECT id FROM "League" WHERE id = ${scope.leagueId} FOR UPDATE`;
  if (!(await readVeoSettings(scope.leagueId, db)).enabled) return;
  const targets = await db.fixture.findMany({
    where: { leagueId: scope.leagueId, publishedAt: null, status: 'SCHEDULED', kickoffAt: { gt: new Date() },
      ...(typeof scope.round === 'number' ? { round: scope.round } : {}), ...(scope.divisionId ? { divisionId: scope.divisionId } : {}) },
    select: { id: true, kickoffAt: true },
  });
  const targetIds = new Set(targets.map(f => f.id));
  const dates = [...new Set(targets.map(f => londonVeoDate(f.kickoffAt)))].sort();
  for (const date of dates) {
    await db.$queryRaw`
      SELECT id FROM "Fixture" WHERE "leagueId" = ${scope.leagueId}
      AND to_char("kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') = ${date}
      ORDER BY id FOR UPDATE
    `;
    const { fixtures, choices } = await previewVeoNight(scope.leagueId, date, db);
    if (fixtures.some(f => !f.locked && !targetIds.has(f.id))) {
      throw new VeoAllocationError(`Publish all divisions and fixtures for ${date} together so Veo can allocate the whole night fairly.`);
    }
    const byId = new Map(fixtures.map(f => [f.id, f]));
    const selected = new Set(choices.map(c => c.fixtureId));
    const finalPitch = new Map(fixtures.map(f => [f.id, f.pitch]));
    for (const choice of choices) {
      const selectedFixture = byId.get(choice.fixtureId)!;
      finalPitch.set(choice.fixtureId, choice.pitch);
      if (choice.swapWithId) finalPitch.set(choice.swapWithId, selectedFixture.pitch);
    }
    for (const f of fixtures) {
      if (f.locked || !targetIds.has(f.id)) continue;
      if (finalPitch.get(f.id) !== f.pitch) {
        await db.fixture.update({ where: { id: f.id }, data: { pitch: finalPitch.get(f.id) }, select: { id: true } });
      }
      if (!f.eligible) continue;
      const allocated = selected.has(f.id);
      const quote = quoteVeoFixture(f, allocated);
      await db.$executeRaw`
        INSERT INTO "VeoFixtureSnapshot" ("fixtureId", "leagueId", "kickoffAt", "venueId", pitch,
          "homeTeamId", "awayTeamId", "homePriority", "awayPriority", allocated,
          "homeBasePence", "awayBasePence", "homeSupplementPence", "awaySupplementPence")
        VALUES (${f.id}, ${scope.leagueId}, ${f.kickoffAt}, ${f.venueId}, ${finalPitch.get(f.id) ?? null},
          ${f.homeTeamId}, ${f.awayTeamId}, ${f.homePriority}, ${f.awayPriority}, ${allocated},
          ${quote.home.basePence}, ${quote.away.basePence}, ${quote.home.supplementPence}, ${quote.away.supplementPence})
      `;
      await db.fixture.update({ where: { id: f.id }, data: {
        homeMatchFeePence: quote.home.totalPence, awayMatchFeePence: quote.away.totalPence,
        matchFeePence: Math.max(quote.home.totalPence, quote.away.totalPence), sixflTvRecorded: allocated,
      }, select: { id: true } });
    }
  }
}
export type VeoSnapshot = {
  fixtureId: string; kickoffAt: Date; pitch: string | null; allocated: boolean;
  homeTeamId: string; awayTeamId: string; homeName: string; awayName: string;
  homePriority: boolean; awayPriority: boolean; homeBasePence: number; awayBasePence: number;
  homeSupplementPence: number; awaySupplementPence: number; sixflTvUrl: string | null; status: string;
};
export async function readVeoSnapshots(leagueId: string, date: string, db: Db = prisma): Promise<VeoSnapshot[]> {
  return db.$queryRaw<VeoSnapshot[]>`
    SELECT s.*, h.name AS "homeName", a.name AS "awayName", f."sixflTvUrl", f.status::text AS status
    FROM "VeoFixtureSnapshot" s JOIN "Fixture" f ON f.id = s."fixtureId"
    JOIN "Team" h ON h.id = s."homeTeamId" JOIN "Team" a ON a.id = s."awayTeamId"
    WHERE s."leagueId" = ${leagueId}
      AND to_char(s."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') = ${date}
    ORDER BY s."kickoffAt", s."fixtureId"
  `;
}
