import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type EarlyContribution = { teamMemberId: string; name: string; goals: number; assists: number };
export type EarlyPerformance = { teamMemberId: string; rating: number | null };

export function readEarlyReport(form: FormData, members: Array<{ id: string; user: { name: string | null; email: string | null } }>) {
  const pomId = String(form.get("playerOfMatchTeamMemberId") ?? "");
  if (pomId && !members.some(member => member.id === pomId)) throw new Error("Choose Player of the Match from your registered squad.");
  const contributions: EarlyContribution[] = [];
  const performances: EarlyPerformance[] = [];
  let playerOfMatchName: string | null = null;
  for (const member of members) {
    const name = member.user.name || member.user.email || "Unnamed player";
    const goals = Number(form.get(`scorerGoals_${member.id}`) ?? 0);
    const assists = Number(form.get(`assists_${member.id}`) ?? 0);
    const ratingText = String(form.get(`rating_${member.id}`) ?? "").trim();
    const rating = ratingText ? Number(ratingText) : null;
    if (![goals, assists].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 999)) {
      throw new Error("Goals and assists must be whole numbers between 0 and 999.");
    }
    if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 10 || Math.round(rating * 10) / 10 !== rating)) {
      throw new Error("Ratings must be between 1 and 10, with up to one decimal place.");
    }
    if (goals + assists > 0) contributions.push({ teamMemberId: member.id, name, goals, assists });
    if (form.get(`played_${member.id}`) === "on" || goals + assists > 0 || rating !== null || pomId === member.id) {
      performances.push({ teamMemberId: member.id, rating });
    }
    if (pomId === member.id) playerOfMatchName = name;
  }
  if (performances.length > 9) throw new Error("A maximum of 9 players can be recorded for one fixture.");
  return { contributions, performances, playerOfMatchName };
}

/** Caller must authenticate captain access to teamId. No result or score is fabricated. */
export async function saveEarlyMatchReport(teamId: string, fixtureId: string, form: FormData) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Fixture" WHERE "id" = ${fixtureId} FOR UPDATE`;
    const fixture = await tx.fixture.findUnique({ where: { id: fixtureId }, include: { result: { select: { id: true } }, league: { select: { publicAt: true } } } });
    if (!fixture || ![fixture.homeTeamId, fixture.awayTeamId].includes(teamId)) throw new Error("This fixture does not belong to your team.");
    if (!fixture.league.publicAt || fixture.league.publicAt > new Date() || !fixture.publishedAt || fixture.kickoffAt > new Date() || !["SCHEDULED", "COMPLETED"].includes(fixture.status)) {
      throw new Error("Match reports open from kick-off for published fixtures that have not been cancelled or postponed.");
    }
    if (fixture.result) throw new Error("The official result has just arrived. Please reload and save using Update match details.");
    const members = await tx.teamMember.findMany({ where: { teamId }, select: { id: true, user: { select: { name: true, email: true } } } });
    const report = readEarlyReport(form, members);
    const existing = await tx.fixtureMatchReport.findUnique({ where: { fixtureId_teamId: { fixtureId, teamId } } });
    const now = new Date();
    const data = {
      contributions: report.contributions as unknown as Prisma.InputJsonValue,
      performances: report.performances as unknown as Prisma.InputJsonValue,
      playerOfMatchName: report.playerOfMatchName,
      coreCompletedAt: report.performances.length && report.playerOfMatchName ? existing?.coreCompletedAt ?? now : null,
      assistsCompletedAt: report.contributions.some(row => row.assists > 0) ? existing?.assistsCompletedAt ?? now : null,
      ratingsCompletedAt: report.performances.length && report.performances.every(row => row.rating !== null) ? existing?.ratingsCompletedAt ?? now : null,
    };
    await tx.fixtureMatchReport.upsert({ where: { fixtureId_teamId: { fixtureId, teamId } }, create: { fixtureId, teamId, ...data }, update: data });
  });
}
