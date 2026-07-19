import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getPlayerPerformanceHistory } from "@/lib/playerMatchPerformances";
import { prisma } from "@/lib/prisma";

type Contribution = { name: string; goals: number; assists: number; teamMemberId?: string };

function normalise(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseContributions(value: unknown): Contribution[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    const goals = Number(row.goals ?? 0);
    const assists = Number(row.assists ?? 0);
    if (!name || !Number.isFinite(goals) || !Number.isFinite(assists)) return [];
    return [{ name, goals, assists, teamMemberId: typeof row.teamMemberId === "string" ? row.teamMemberId : undefined }];
  });
}

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, { day: "2-digit", month: "short", year: "numeric" });
}

function Stat({ label, value, suffix = "" }: { label: string; value: string | number; suffix?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-2xl font-black text-white">{value}{suffix}</div><div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-white/45">{label}</div></div>;
}

export default async function PlayerPerformancePanel({ teamId }: { teamId: string }) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;

  const membership = await prisma.teamMember.findFirst({
    where: { teamId, user: { email } },
    select: { id: true, user: { select: { name: true, email: true } }, team: { select: { name: true } } },
  });
  if (!membership) return null;

  const [history, metadata] = await Promise.all([
    getPlayerPerformanceHistory({ teamId, teamMemberId: membership.id, limit: 30 }),
    prisma.matchResultTeamMeta.findMany({ where: { teamId }, select: { scorers: true, playerOfMatchName: true } }),
  ]);

  const displayName = membership.user.name || membership.user.email || "Player";
  let goals = 0;
  let assists = 0;
  let playerOfMatchAwards = 0;
  for (const detail of metadata) {
    for (const contribution of parseContributions(detail.scorers)) {
      if (contribution.teamMemberId === membership.id || (!contribution.teamMemberId && normalise(contribution.name) === normalise(displayName))) {
        goals += contribution.goals;
        assists += contribution.assists;
      }
    }
    if (normalise(detail.playerOfMatchName) === normalise(displayName)) playerOfMatchAwards += 1;
  }

  const ratings = history.flatMap((match) => (match.rating === null ? [] : [Number(match.rating)]));
  const averageRating = ratings.length > 0 ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null;

  return (
    <section className="bg-[#07130f] px-4 pb-8 text-white">
      <div className="mx-auto max-w-6xl rounded-3xl border border-sky-400/15 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.13),transparent_38%),rgba(255,255,255,0.04)] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200/70">Your performances</p><h2 className="mt-2 text-2xl font-semibold text-white">Player stats</h2><p className="mt-2 text-sm text-white/60">Appearances and ratings are added by your captain after each match.</p></div>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">{membership.team.name}</span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Appearances" value={history.length} />
          <Stat label="Average rating" value={averageRating === null ? "—" : averageRating.toFixed(1)} suffix={averageRating === null ? "" : "/10"} />
          <Stat label="Goals" value={goals} />
          <Stat label="Assists" value={assists} />
          <Stat label="Player of match" value={playerOfMatchAwards} />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">Recent performances</h3><span className="text-xs text-white/40">Latest {Math.min(history.length, 5)}</span></div>
          {history.length === 0 ? <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-sm text-white/50">No appearances have been recorded yet.</div> : (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              {history.slice(0, 5).map((match) => {
                const opponent = match.homeTeamId === teamId ? match.awayTeamName : match.homeTeamName;
                return <div key={match.matchResultId} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs text-white/40">{formatDate(match.kickoffAt)}</div><div className="mt-1 truncate text-sm font-semibold text-white">vs {opponent}</div><div className="mt-2 flex items-center justify-between text-xs text-white/55"><span>{match.homeScore}-{match.awayScore}</span><span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 font-semibold text-sky-100">{match.rating === null ? "Not rated" : `${Number(match.rating).toFixed(1)}/10`}</span></div></div>;
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
