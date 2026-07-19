import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  getMatchPerformances,
  replaceMatchPerformances,
  type MatchPerformance,
} from "@/lib/playerMatchPerformances";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Who Played & Ratings | SIXFL" };

type SearchParams = { saved?: string; error?: string };
type MatchPlayer = {
  id: string;
  name: string;
  role: string;
  selected: boolean;
};

function playerName(member: { user: { name: string | null; email: string | null } }) {
  return member.user.name || member.user.email || "Unnamed player";
}

function formatMatchDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ratingIsValid(value: number) {
  return Number.isFinite(value) && value >= 1 && value <= 10 && Math.round(value * 2) === value * 2;
}

function friendlyError(error: unknown) {
  if (!(error instanceof Error)) return "The player details could not be saved.";
  if (error.message.includes("rating")) return "Ratings must be between 1 and 10. Half marks such as 7.5 are allowed.";
  if (error.message.includes("player")) return "One of those players is not in this match squad.";
  if (error.message.includes("result")) return "That result could not be found for this team.";
  return error.message;
}

async function savePlayerPerformances(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "").trim();
  const resultId = String(formData.get("resultId") ?? "").trim();
  await requireCaptain(teamid);

  try {
    const [result, team] = await Promise.all([
      prisma.matchResult.findUnique({
        where: { id: resultId },
        select: {
          id: true,
          fixture: {
            select: {
              homeTeamId: true,
              awayTeamId: true,
              selections: {
                where: { teamMember: { teamId: teamid } },
                select: { selectionStatus: true, teamMemberId: true },
              },
            },
          },
        },
      }),
      prisma.team.findUnique({
        where: { id: teamid },
        select: { members: { select: { id: true } } },
      }),
    ]);

    if (!result || (result.fixture.homeTeamId !== teamid && result.fixture.awayTeamId !== teamid)) {
      throw new Error("Result not found for this team.");
    }
    if (!team) throw new Error("Team not found.");

    const selectedIds = result.fixture.selections
      .filter((selection) => selection.selectionStatus === "SELECTED")
      .map((selection) => selection.teamMemberId);
    const allowedIds = selectedIds.length > 0 ? selectedIds : team.members.map((member) => member.id);
    const allowed = new Set(allowedIds);
    const rows: Array<{ teamMemberId: string; rating: number | null }> = [];

    for (const memberId of allowedIds) {
      const ratingRaw = String(formData.get(`rating_${memberId}`) ?? "").trim();
      const rating = ratingRaw ? Number(ratingRaw) : null;
      const played = formData.get(`played_${memberId}`) === "on" || rating !== null;

      if (rating !== null && !ratingIsValid(rating)) throw new Error("Invalid rating.");
      if (!played) continue;
      if (!allowed.has(memberId)) throw new Error("Invalid player.");
      rows.push({ teamMemberId: memberId, rating });
    }

    await replaceMatchPerformances({ teamId: teamid, matchResultId: resultId, rows });
    revalidatePath(`/captain/team/${teamid}/results`);
    revalidatePath(`/captain/team/${teamid}/results/ratings`);
    revalidatePath(`/captain/team/${teamid}/captain-squad`);
    revalidatePath(`/player/team/${teamid}`);
  } catch (error) {
    redirect(`/captain/team/${teamid}/results/ratings?error=${encodeURIComponent(friendlyError(error))}`);
  }

  redirect(`/captain/team/${teamid}/results/ratings?saved=${encodeURIComponent(resultId)}`);
}

export default async function PlayerRatingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  const filters = await searchParams;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: { id: true, role: true, user: { select: { name: true, email: true } } },
      },
    },
  });
  if (!team) notFound();

  const fixtures = await prisma.fixture.findMany({
    where: { OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }], result: { isNot: null } },
    orderBy: { kickoffAt: "desc" },
    take: 20,
    select: {
      id: true,
      kickoffAt: true,
      homeTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      result: { select: { id: true, homeScore: true, awayScore: true } },
      selections: {
        where: { teamMember: { teamId: teamid } },
        select: {
          selectionStatus: true,
          teamMember: { select: { id: true, role: true, user: { select: { name: true, email: true } } } },
        },
      },
    },
  });

  const resultIds = fixtures.flatMap((fixture) => (fixture.result ? [fixture.result.id] : []));
  const performances: MatchPerformance[] = await getMatchPerformances(teamid, resultIds);
  const byResult = new Map<string, MatchPerformance[]>();
  for (const performance of performances) {
    const rows = byResult.get(performance.matchResultId) ?? [];
    rows.push(performance);
    byResult.set(performance.matchResultId, rows);
  }

  const fallbackPlayers: MatchPlayer[] = team.members.map((member) => ({
    id: member.id,
    name: playerName(member),
    role: member.role,
    selected: false,
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sky-400/20 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_38%),rgba(255,255,255,0.04)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] lg:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-200/75">Player performances</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Who played & player ratings</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
          Open a result, tick everyone who took part and optionally rate each player from 1 to 10. Ratings can use half marks such as 7.5.
        </p>
      </section>

      {filters.saved ? <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">Appearances and ratings saved.</section> : null}
      {filters.error ? <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{decodeURIComponent(filters.error)}</section> : null}

      <div className="space-y-4">
        {fixtures.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-white/60">No completed results are available yet.</div> : null}
        {fixtures.map((fixture) => {
          if (!fixture.result) return null;
          const stored = byResult.get(fixture.result.id) ?? [];
          const storedByMember = new Map(stored.map((row) => [row.teamMemberId, row]));
          const selectedPlayers: MatchPlayer[] = fixture.selections
            .filter((selection) => selection.selectionStatus === "SELECTED")
            .map((selection) => ({
              id: selection.teamMember.id,
              name: playerName(selection.teamMember),
              role: selection.teamMember.role,
              selected: true,
            }));
          const players = selectedPlayers.length > 0 ? selectedPlayers : fallbackPlayers;
          const playedCount = stored.filter((row) => row.played).length;
          const ratedCount = stored.filter((row) => row.rating !== null).length;
          const opponent = fixture.homeTeamId === teamid ? fixture.awayTeam.name : fixture.homeTeam.name;

          return (
            <details key={fixture.id} className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_18px_60px_rgba(0,0,0,0.2)]" open={filters.saved === fixture.result.id}>
              <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-5 transition hover:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
                <div>
                  <p className="text-xs text-white/45">{formatMatchDate(fixture.kickoffAt)} · Opponent: {opponent}</p>
                  <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">{fixture.homeTeam.name} {fixture.result.homeScore}-{fixture.result.awayScore} {fixture.awayTeam.name}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-white/65">{selectedPlayers.length > 0 ? "Selected squad" : "Full squad fallback"}</span>
                  <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-sky-100">{playedCount} played · {ratedCount} rated</span>
                  <span className="text-white/45 transition group-open:rotate-180">⌄</span>
                </div>
              </summary>

              <form action={savePlayerPerformances} className="border-t border-white/10 p-5">
                <input type="hidden" name="teamid" value={teamid} />
                <input type="hidden" name="resultId" value={fixture.result.id} />
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/15">
                  <div className="grid grid-cols-[1fr_72px_92px] gap-3 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-white/45">
                    <span>Player</span><span className="text-center">Played</span><span className="text-right">Rating</span>
                  </div>
                  <div className="divide-y divide-white/10">
                    {players.map((player) => {
                      const saved = storedByMember.get(player.id);
                      const defaultPlayed = saved ? saved.played : selectedPlayers.length > 0;
                      return (
                        <div key={player.id} className="grid grid-cols-[1fr_72px_92px] items-center gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">{player.name}</div>
                            <div className="text-xs text-white/40">{player.selected ? "Selected squad" : player.role.replaceAll("_", " ").toLowerCase()}</div>
                          </div>
                          <label className="flex justify-center"><input type="checkbox" name={`played_${player.id}`} defaultChecked={defaultPlayed} className="h-5 w-5 accent-emerald-400" aria-label={`Mark ${player.name} as played`} /></label>
                          <input type="number" name={`rating_${player.id}`} defaultValue={saved?.rating ?? ""} min={1} max={10} step={0.5} inputMode="decimal" placeholder="—" className="h-11 w-full rounded-xl border border-white/10 bg-[#0d1428] px-3 text-right text-sm font-semibold text-white outline-none placeholder:text-white/25 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20" aria-label={`Rating for ${player.name}`} />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-sky-400/15 bg-sky-500/[0.07] p-4 text-sm text-sky-50/75 sm:flex-row sm:items-center sm:justify-between">
                  <span>A rating is optional. Entering one automatically counts that player as having played.</span>
                  <button type="submit" className="rounded-full border border-sky-300/30 bg-sky-500/15 px-5 py-2.5 font-semibold text-sky-50 transition hover:bg-sky-500/25">Save players & ratings</button>
                </div>
              </form>
            </details>
          );
        })}
      </div>
    </div>
  );
}
