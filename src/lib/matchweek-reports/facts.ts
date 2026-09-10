import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseLondonDateTime, toLondonDateInputValue } from "@/lib/datetime/london";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";
import { ReportError, validDate, type ReportSource, type ReportMatch } from "./types";

// No standings are calculated here. Table/form claims are deliberately omitted
// until the central standings service supports a verified historical snapshot.
export const sourceHash = (source: ReportSource) => createHash("sha256").update(JSON.stringify(source)).digest("hex");
const name = (value: unknown) => typeof value === "string" && !value.includes("@") ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 160) : "";
export function recordedScorers(value: unknown, team: string, score: number) {
  if (!Array.isArray(value)) return [];
  const rows = value.flatMap((v: unknown) => {
    if (!v || typeof v !== "object") return [];
    const row = v as Record<string, unknown>;
    const player = name(row.name), goals = Number(row.goals);
    return player && Number.isInteger(goals) && goals > 0 && goals <= score ? [{ team, name: player, goals }] : [];
  });
  // Inconsistent scorer records must not become confident reporting claims.
  return rows.reduce((sum, r) => sum + r.goals, 0) <= score ? rows : [];
}
export async function getReportSource(slug: string, requestedDate?: string): Promise<ReportSource | null> {
  const league = await prisma.league.findFirst({ where: { slug, isActive: true }, select: { id: true, name: true, area: true } });
  if (!league) return null;
  const latest = requestedDate ? null : await prisma.fixture.findFirst({
    where: { leagueId: league.id, publishedAt: { not: null }, status: "COMPLETED", result: { isNot: null }, kickoffAt: { lte: new Date() } },
    orderBy: [{ kickoffAt: "desc" }, { id: "asc" }], select: { kickoffAt: true },
  });
  const matchDate = requestedDate ? validDate(requestedDate) : latest ? toLondonDateInputValue(latest.kickoffAt) : toLondonDateInputValue(new Date());
  const nextDate = new Date(`${matchDate}T12:00:00Z`); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const fixtures = await prisma.fixture.findMany({
    where: { leagueId: league.id, publishedAt: { not: null }, kickoffAt: { gte: parseLondonDateTime(matchDate, "00:00"), lt: parseLondonDateTime(nextDate.toISOString().slice(0, 10), "00:00") } },
    orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
    select: { id: true, status: true, kickoffAt: true,
      homeTeam: { select: { id: true, name: true } }, awayTeam: { select: { id: true, name: true } },
      result: { select: { homeScore: true, awayScore: true, isDisputed: true,
        teamMetadata: { select: { teamId: true, scorers: true, playerOfMatchName: true } },
        disputes: { where: { status: { in: ["OPEN", "REVIEW"] } }, select: { id: true }, take: 1 },
      } },
    },
  });
  if (fixtures.length > 40) throw new ReportError("This match night is too large for one report. Please contact SIXFL support.");
  const ids = fixtures.map(f => f.id);
  const placeholders = await getFixturePlaceholderTeamIds(fixtures.flatMap(f => [f.homeTeam.id, f.awayTeam.id]));
  // Only IDs are read: no conduct notes, payment information or contact details
  // are passed to OpenAI. Administrative/replacement outcomes need human review.
  const exceptions = ids.length ? await prisma.$queryRaw<Array<{ fixtureId: string }>>(Prisma.sql`
    SELECT "fixtureId" FROM "FixtureAbandonment" WHERE "fixtureId" IN (${Prisma.join(ids)})
    UNION SELECT "fixtureId" FROM "LastMinuteReplacementResolution" WHERE "fixtureId" IN (${Prisma.join(ids)})
  `) : [];
  const excluded = new Set(exceptions.map(r => r.fixtureId));
  let pendingFixtures = 0, omittedFixtures = 0;
  const warnings: string[] = [];
  const matches: ReportMatch[] = [];
  for (const f of fixtures) {
    if (f.status === "SCHEDULED" || (f.status === "COMPLETED" && !f.result)) { pendingFixtures++; continue; }
    if (f.status !== "COMPLETED") { omittedFixtures++; continue; }
    const r = f.result!;
    if (f.kickoffAt > new Date() || r.isDisputed || r.disputes.length || excluded.has(f.id) || placeholders.has(f.homeTeam.id) || placeholders.has(f.awayTeam.id) || [f.homeTeam.name, f.awayTeam.name].some(n => n.trim().toUpperCase() === "TBC")) { omittedFixtures++; continue; }
    if (![r.homeScore, r.awayScore].every(n => Number.isInteger(n) && n >= 0 && n <= 99)) { omittedFixtures++; continue; }
    const teamA = name(f.homeTeam.name), teamB = name(f.awayTeam.name);
    if (!teamA || !teamB) { omittedFixtures++; continue; }
    const a = r.teamMetadata.find(m => m.teamId === f.homeTeam.id), b = r.teamMetadata.find(m => m.teamId === f.awayTeam.id);
    const scorers = [...recordedScorers(a?.scorers, teamA, r.homeScore), ...recordedScorers(b?.scorers, teamB, r.awayScore)];
    const playersOfMatch = [[a, teamA], [b, teamB]].flatMap(([meta, team]) => {
      const player = name((meta as typeof a)?.playerOfMatchName);
      return player ? [{ team: team as string, name: player }] : [];
    });
    matches.push({ fixtureId: f.id, teamA, teamB, scoreA: r.homeScore, scoreB: r.awayScore, scorers, playersOfMatch });
  }
  if (pendingFixtures) warnings.push(`${pendingFixtures} published fixture(s) still await a completed result. This will be a partial round-up.`);
  if (omittedFixtures) warnings.push(`${omittedFixtures} fixture(s) omitted: postponed, cancelled, disputed, placeholder, abandonment, replacement or invalid result. Review these separately.`);
  return { leagueId: league.id, leagueName: name(league.name), area: name(league.area) || null, matchDate, matches, pendingFixtures, omittedFixtures, warnings };
}
