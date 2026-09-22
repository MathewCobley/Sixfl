type AppOwnStats = {
  appearances: number;
  goals: number;
  assists: number;
  playerOfMatchAwards: number;
  averageRating: number | null;
};

type AppLeader = {
  teamMemberId: string;
  name: string;
  value: string;
  isCurrentPlayer: boolean;
};

type AppLeaderboard = {
  title: string;
  label: string;
  rows: AppLeader[];
};

type AppSquadRow = {
  teamMemberId: string;
  name: string;
  appearances: number;
  goals: number;
  assists: number;
  playerOfMatchAwards: number;
  averageRating: number | null;
  isCurrentPlayer: boolean;
};

type AppRecentMatch = {
  id: string;
  dateLabel: string;
  opponent: string;
  teamScore: number;
  opponentScore: number;
  goalsRecorded: number;
  assistsRecorded: number;
  averageRating: number | null;
  playerOfMatchName: string | null;
};

function rating(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(1);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function outcome(match: AppRecentMatch) {
  if (match.teamScore > match.opponentScore) return "W";
  if (match.teamScore < match.opponentScore) return "L";
  return "D";
}

function outcomeClasses(value: "W" | "D" | "L") {
  if (value === "W") return "bg-emerald-400/20 text-emerald-100";
  if (value === "L") return "bg-red-400/15 text-red-100";
  return "bg-white/10 text-white/70";
}

export default function PlayerAppStats({
  teamName,
  seasonLabel,
  ownStats,
  leaderboards,
  squad,
  recentMatches,
}: {
  teamName: string;
  seasonLabel: string;
  ownStats: AppOwnStats | null;
  leaderboards: AppLeaderboard[];
  squad: AppSquadRow[];
  recentMatches: AppRecentMatch[];
}) {
  const goalInvolvements = ownStats ? ownStats.goals + ownStats.assists : 0;

  return (
    <section className="px-3 pb-24 pt-3 text-white">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300/75">
            My stats
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">
            Your season
          </h1>
          <p className="mt-1 text-xs text-white/45">
            {teamName} · {seasonLabel}
          </p>
        </div>

        {ownStats ? (
          <section className="overflow-hidden rounded-[1.5rem] border border-violet-400/25 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.18),transparent_42%),linear-gradient(145deg,#141126,#08140f)] shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
            <div className="grid grid-cols-3 divide-x divide-white/[0.07] border-b border-white/[0.07]">
              {[
                ["Apps", ownStats.appearances],
                ["Goals", ownStats.goals],
                ["Assists", ownStats.assists],
              ].map(([label, value]) => (
                <div key={String(label)} className="px-2 py-4 text-center">
                  <div className="text-2xl font-black tabular-nums text-white">{value}</div>
                  <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 divide-x divide-white/[0.07] bg-black/15">
              <div className="px-2 py-3 text-center">
                <div className="text-xl font-black tabular-nums text-sky-100">{goalInvolvements}</div>
                <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">G+A</div>
              </div>
              <div className="px-2 py-3 text-center">
                <div className="text-xl font-black tabular-nums text-violet-100">{ownStats.playerOfMatchAwards}</div>
                <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">POTM</div>
              </div>
              <div className="px-2 py-3 text-center">
                <div className="text-xl font-black tabular-nums text-emerald-100">{rating(ownStats.averageRating)}</div>
                <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">Rating</div>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-[1.4rem] border border-white/10 bg-white/[0.035] p-4 text-sm text-white/45">
            Your recorded match stats will appear here.
          </section>
        )}

        <section>
          <div className="mb-2 px-1">
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-white/55">
              Team leaders
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {leaderboards.map((board) => (
              <article
                key={board.title}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3"
              >
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-200/70">
                  {board.title}
                </div>
                {board.rows.length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {board.rows.map((player, index) => (
                      <div
                        key={player.teamMemberId}
                        className={[
                          "flex items-center gap-2 rounded-xl px-2 py-2",
                          player.isCurrentPlayer
                            ? "bg-emerald-500/10"
                            : "bg-black/15",
                        ].join(" ")}
                      >
                        <span className="w-4 shrink-0 text-[10px] font-black text-white/35">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-white/75">
                          {player.isCurrentPlayer ? "You" : player.name}
                        </span>
                        <span className="shrink-0 text-sm font-black text-white">
                          {player.value}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-[11px] text-white/35">Nothing recorded yet.</div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-white/55">
              Squad leaderboard
            </h2>
            <span className="text-[10px] text-white/30">{squad.length} players</span>
          </div>
          <div className="overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-white/[0.03]">
            {squad.map((player, index) => (
              <div
                key={player.teamMemberId}
                className={[
                  "flex items-center gap-3 px-3 py-3",
                  index < squad.length - 1 ? "border-b border-white/[0.06]" : "",
                  player.isCurrentPlayer ? "bg-emerald-500/[0.07]" : "",
                ].join(" ")}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black/20 text-[11px] font-black text-white/40">
                  {index + 1}
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-black text-white/55">
                  {initials(player.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">
                    {player.isCurrentPlayer ? "You" : player.name}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-white/35">
                    {player.appearances} apps · {player.playerOfMatchAwards} POTM · rating {rating(player.averageRating)}
                  </span>
                </span>
                <span className="grid shrink-0 grid-cols-3 gap-2 text-center">
                  <span>
                    <span className="block text-sm font-black text-white">{player.goals}</span>
                    <span className="block text-[8px] font-bold uppercase text-white/30">G</span>
                  </span>
                  <span>
                    <span className="block text-sm font-black text-white">{player.assists}</span>
                    <span className="block text-[8px] font-bold uppercase text-white/30">A</span>
                  </span>
                  <span>
                    <span className="block text-sm font-black text-sky-100">{player.goals + player.assists}</span>
                    <span className="block text-[8px] font-bold uppercase text-white/30">G+A</span>
                  </span>
                </span>
              </div>
            ))}
            {squad.length === 0 ? (
              <div className="p-4 text-sm text-white/45">No squad stats recorded yet.</div>
            ) : null}
          </div>
        </section>

        <section>
          <div className="mb-2 px-1">
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-white/55">
              Recent matches
            </h2>
          </div>
          <div className="space-y-2">
            {recentMatches.map((match) => {
              const result = outcome(match);
              return (
                <article
                  key={match.id}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${outcomeClasses(result)}`}>
                      {result}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-white">vs {match.opponent}</div>
                      <div className="mt-0.5 text-[10px] text-white/35">{match.dateLabel}</div>
                    </div>
                    <div className="shrink-0 text-xl font-black tabular-nums text-white">
                      {match.teamScore}–{match.opponentScore}
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] text-white/50">
                    <span className="rounded-full bg-black/20 px-2 py-1">⚽ {match.goalsRecorded}</span>
                    <span className="rounded-full bg-black/20 px-2 py-1">A {match.assistsRecorded}</span>
                    <span className="rounded-full bg-black/20 px-2 py-1">Rating {rating(match.averageRating)}</span>
                    {match.playerOfMatchName ? (
                      <span className="rounded-full bg-violet-500/10 px-2 py-1 text-violet-100">
                        POTM {match.playerOfMatchName}
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {recentMatches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/40">
                Match stats will appear here after completed match reports.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
