import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import {
  getEarlyMatchReportCutoff,
  saveEarlyMatchReport,
  type EarlyContribution,
  type EarlyPerformance,
} from "@/lib/match-reports/early";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import MatchDetailsPlayerFields from "./MatchDetailsPlayerFields";
import FormListboxField from "@/components/ui/FormListboxField";

async function save(form: FormData) {
  "use server";
  const teamId = String(form.get("teamid") ?? "");
  const fixtureId = String(form.get("fixtureId") ?? "");
  await requireCaptain(teamId);
  try {
    await saveEarlyMatchReport(teamId, fixtureId, form);
  } catch (error) {
    redirect(`/captain/team/${teamId}/results?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save match details.")}`);
  }
  revalidatePath(`/captain/team/${teamId}/results`);
  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath("/admin/results");
  revalidatePath(`/admin/fixtures/${fixtureId}/result`);
  redirect(`/captain/team/${teamId}/results?saved=early#early-${encodeURIComponent(fixtureId)}`);
}

export default async function EarlyMatchReports({ teamId, query = "", outcome = "" }: { teamId: string; query?: string; outcome?: string }) {
  // Authorize here too: this component must remain safe if reused on another page.
  await requireCaptain(teamId);
  if (outcome) return null;
  const now = new Date();
  const recentCutoff = getEarlyMatchReportCutoff(now);
  const [fixtures, members] = await Promise.all([
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        publishedAt: { not: null },
        status: { in: ["SCHEDULED", "COMPLETED"] },
        league: { publicAt: { lte: now } },
        result: { is: null },
        AND: [
          {
            OR: [
              { kickoffAt: { gte: recentCutoff, lte: now } },
              { earlyReports: { some: { teamId } } },
            ],
          },
        ],
      },
      orderBy: { kickoffAt: "desc" },
      include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } }, earlyReports: { where: { teamId } }, selections: { where: { teamMember: { teamId }, selectionStatus: "SELECTED" }, select: { teamMemberId: true } } },
    }),
    prisma.teamMember.findMany({ where: { teamId }, orderBy: [{ role: "asc" }, { createdAt: "asc" }], select: { id: true, role: true, user: { select: { name: true, email: true } } } }),
  ]);
  const search = query.trim().toLowerCase();
  return <div className="space-y-4">
    {fixtures.filter(fixture => !search || [fixture.homeTeam.name, fixture.awayTeam.name, ...members.map(member => member.user.name || member.user.email || "")].join(" ").toLowerCase().includes(search)).map(fixture => {
      const report = fixture.earlyReports[0];
      const contributions = (report?.contributions ?? []) as EarlyContribution[];
      const performances = (report?.performances ?? []) as EarlyPerformance[];
      const players = members.map(member => {
        const contribution = contributions.find(row => row.teamMemberId === member.id);
        const performance = performances.find(row => row.teamMemberId === member.id);
        return { id: member.id, name: member.user.name || member.user.email || "Unnamed player", email: member.user.email, role: member.role,
          played: report ? Boolean(performance) : fixture.selections.some(selection => selection.teamMemberId === member.id),
          goals: contribution?.goals ?? 0, assists: contribution?.assists ?? 0, rating: performance?.rating ?? null };
      });
      return <section id={`early-${fixture.id}`} key={fixture.id} className="scroll-mt-6 rounded-3xl border border-amber-300/25 bg-white/[0.04] p-4 sm:p-6">
        <p className="text-sm text-white/60">{formatDateTimeInLondon(fixture.kickoffAt, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        <h2 className="mt-1 text-xl font-semibold text-white">{fixture.homeTeam.name} vs {fixture.awayTeam.name}</h2>
        <p className="mt-2 font-semibold text-amber-200">Awaiting official result</p>
        <p className="mt-2 text-sm text-white/70">Add who played, scorers, own goals, assists, ratings and Player of the Match now while it is fresh. Your report will carry across when SIXFL enters the score.</p>
        {report ? <p className="mt-3 text-sm text-emerald-200">Report saved — you can update it below. {contributions.reduce((sum, row) => sum + row.goals, 0)} player goals{report.ownGoals > 0 ? ` + ${report.ownGoals} own goal${report.ownGoals === 1 ? "" : "s"}` : ""} recorded.</p> : null}
        {members.length <= 1 ? <a className="mt-4 inline-block text-emerald-200 underline" href={`/captain/team/${teamId}/captain-squad#add-player`}>Add your squad to use match reporting</a> : <form action={save} className="mt-4 space-y-4">
          <input type="hidden" name="teamid" value={teamId}/><input type="hidden" name="fixtureId" value={fixture.id}/>
          <MatchDetailsPlayerFields players={players} goalsFor={null}/>
          <label className="block rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-4">
            <span className="text-sm font-semibold text-white">Own goals</span>
            <span className="mt-1 block text-xs leading-5 text-white/50">Use this only when an opponent scored into their own net. Do not assign that goal to one of your players.</span>
            <input
              type="number"
              name="ownGoals"
              defaultValue={report?.ownGoals ?? 0}
              min={0}
              max={999}
              inputMode="numeric"
              aria-label="Own goals"
              className="mt-3 h-11 w-24 rounded-xl border border-white/10 bg-[#0d1428] px-3 text-center text-base font-bold text-white outline-none focus:border-amber-300/50"
            />
          </label>
          <FormListboxField name="playerOfMatchTeamMemberId" label="Player of the Match" value={players.find(player => player.name === report?.playerOfMatchName)?.id ?? ""} options={[{ value: "", label: "No Player of the Match yet" }, ...players.map(player => ({ value: player.id, label: player.name }))]}/>
          <p className="text-sm text-white/60">Maximum 9 players. Ratings and assists are optional. Saving this report does not set the official score.</p>
          <button type="submit" className="min-h-11 rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black">Save match details</button>
        </form>}
      </section>;
    })}
  </div>;
}
