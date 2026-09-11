import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseLondonDateTime, toLondonDateInputValue } from "@/lib/datetime/london";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";
import { ReportError, validDate, type ReportSource, type ReportMatch, type ReportSkippedFixture } from "./types";

// No standings are calculated here. Table/form claims are deliberately omitted
// until the central standings service supports a verified historical snapshot.
export function sourceHash(source: ReportSource) {
  // Adding admin-only explanations must not invalidate existing saved articles
  // or force another paid generation. Included facts/counts still affect the hash.
  const { skippedFixtures: _reviewDetails, ...articleSource } = source;
  return createHash("sha256").update(JSON.stringify(articleSource)).digest("hex");
}
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
      result: { select: { homeScore: true, awayScore: true, overturnedAt: true, isDisputed: true,
        teamMetadata: { select: { teamId: true, scorers: true, playerOfMatchName: true } },
        disputes: { where: { status: { in: ["OPEN", "REVIEW"] } }, select: { id: true }, take: 1 },
      } },
    },
  });
  if (fixtures.length > 40) throw new ReportError("This match night is too large for one report. Please contact SIXFL support.");
  const ids = fixtures.map(f => f.id);
  const placeholders = await getFixturePlaceholderTeamIds(fixtures.flatMap(f => [f.homeTeam.id, f.awayTeam.id]));
  // A resolved replacement is successful scheduling history, not a result
  // blocker. Report the teams currently assigned to the completed fixture.
  // Only abandonment records need this extra review; all normal result checks
  // below still apply. Read no private narratives, contacts or payment data.
  const exceptions = ids.length ? await prisma.$queryRaw<Array<{ fixtureId: string; reason: string }>>(Prisma.sql`
    SELECT "fixtureId", 'abandonment'::text AS "reason" FROM "FixtureAbandonment" WHERE "fixtureId" IN (${Prisma.join(ids)})
  `) : [];
  const exceptionReasons = new Map<string, ReportSkippedFixture["reasons"]>();
  for (const row of exceptions) {
    const reason = row.reason === "abandonment"
      ? { code: "abandonment", message: "An abandonment record is attached to this fixture; its administrative outcome needs editorial review." }
      : { code: "administrative_record", message: "An administrative exception is recorded for this fixture and needs editorial review." };
    const reasons = exceptionReasons.get(row.fixtureId) ?? [];
    if (!reasons.some(r => r.code === reason.code)) reasons.push(reason);
    exceptionReasons.set(row.fixtureId, reasons);
  }
  let pendingFixtures = 0, omittedFixtures = 0;
  const warnings: string[] = [];
  const matches: ReportMatch[] = [];
  const skippedFixtures: ReportSkippedFixture[] = [];
  const now = new Date();
  for (const f of fixtures) {
    const r = f.result;
    const teamA = name(f.homeTeam.name), teamB = name(f.awayTeam.name);
    const reasons: ReportSkippedFixture["reasons"] = [];
    const pending = f.status === "SCHEDULED" || (f.status === "COMPLETED" && !r);
    if (f.status === "SCHEDULED") reasons.push({ code: "scheduled", message: r ? "A result is saved, but the fixture is still marked scheduled rather than completed." : "No completed result is recorded; the fixture is still marked scheduled." });
    else if (f.status === "COMPLETED" && !r) reasons.push({ code: "missing_result", message: "The fixture is marked completed, but no result has been saved." });
    else if (f.status === "POSTPONED") reasons.push({ code: "postponed", message: "The fixture is marked postponed." });
    else if (f.status === "CANCELLED") reasons.push({ code: "cancelled", message: "The fixture is marked cancelled." });
    else if (f.status !== "COMPLETED") reasons.push({ code: "not_completed", message: `The fixture is not marked completed (recorded status: ${f.status}).` });
    if (f.kickoffAt > now) reasons.push({ code: "future_kickoff", message: "The recorded kick-off time is still in the future." });
    if (r?.overturnedAt) reasons.push({ code: "result_overturned", message: "This result was overturned by SIXFL. Its original playing score and awarded competition result need editorial review; do not describe the award as goals scored." });
    if (r?.isDisputed) reasons.push({ code: "disputed_result", message: "The saved result is flagged as disputed." });
    if (r?.disputes.length) reasons.push({ code: "unresolved_dispute", message: "There is an open or under-review dispute against the result." });
    reasons.push(...(exceptionReasons.get(f.id) ?? []));
    if (placeholders.has(f.homeTeam.id) || placeholders.has(f.awayTeam.id) || [f.homeTeam.name, f.awayTeam.name].some(n => n.trim().toUpperCase() === "TBC")) reasons.push({ code: "placeholder", message: "The fixture contains a placeholder or TBC team rather than two confirmed teams." });
    if (r && ![r.homeScore, r.awayScore].every(n => Number.isInteger(n) && n >= 0 && n <= 99)) reasons.push({ code: "invalid_score", message: "The saved score is invalid: both scores must be whole numbers between 0 and 99." });
    if (!teamA || !teamB) reasons.push({ code: "invalid_team_name", message: "One or both team names are missing or unsuitable for reporting. Review the fixture to identify the teams." });
    if (reasons.length) {
      if (pending) pendingFixtures++; else omittedFixtures++;
      skippedFixtures.push({ fixtureId: f.id, teamA: teamA || "Unnamed team", teamB: teamB || "Unnamed team", kickoffAt: f.kickoffAt.toISOString(), disposition: pending ? "pending" : "omitted", reasons });
      continue;
    }
    // Completed replacement games reach this same path as any other valid result.
    const result = r!;
    const a = result.teamMetadata.find(m => m.teamId === f.homeTeam.id), b = result.teamMetadata.find(m => m.teamId === f.awayTeam.id);
    const scorers = [...recordedScorers(a?.scorers, teamA, result.homeScore), ...recordedScorers(b?.scorers, teamB, result.awayScore)];
    const playersOfMatch = [[a, teamA], [b, teamB]].flatMap(([meta, team]) => {
      const player = name((meta as typeof a)?.playerOfMatchName);
      return player ? [{ team: team as string, name: player }] : [];
    });
    matches.push({ fixtureId: f.id, teamA, teamB, scoreA: result.homeScore, scoreB: result.awayScore, scorers, playersOfMatch });
  }
  // Preserve legacy summary fields for saved source hashes. The editor renders
  // the structured fixture explanations, not this old catch-all warning. Its
  // historic replacement label is NOT an eligibility rule or displayed reason.
  if (pendingFixtures) warnings.push(`${pendingFixtures} published fixture(s) still await a completed result. This will be a partial round-up.`);
  if (omittedFixtures) warnings.push(`${omittedFixtures} fixture(s) omitted: postponed, cancelled, disputed, placeholder, abandonment, replacement or invalid result. Review these separately.`);
  return { leagueId: league.id, leagueName: name(league.name), area: name(league.area) || null, matchDate, matches, pendingFixtures, omittedFixtures, warnings, skippedFixtures };
}
