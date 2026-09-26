import type { PublishedNews } from "@/lib/league-news/types";
import { newsDate } from "@/components/news/NewsArticle";
import NewsImage from "@/components/news/NewsImage";

/** App presentation of the same published matchweek report snapshot used publicly. */
export default function PlayerNewsArticle({ news, teamId }: { news: PublishedNews; teamId: string }) {
  const article = news.article;
  const teamMatches = article.matches.filter((match) =>
    [match.teamAId, match.teamBId].includes(teamId),
  );
  const otherMatches = article.matches.filter(
    (match) => ![match.teamAId, match.teamBId].includes(teamId),
  );
  const orderedMatches = [...teamMatches, ...otherMatches];

  return <article className="space-y-5">
    <header>
      <p className="text-xs font-bold text-emerald-200">{article.leagueName} · {newsDate(article.matchDate)}</p>
      <h2 className="mt-2 text-2xl font-black leading-tight">{news.matchweekNumber ? `Matchweek ${news.matchweekNumber} report` : "Matchweek report"}</h2>
      <p className="mt-2 text-sm font-bold leading-6 text-white/65">{article.title}</p>
      {article.cover ? <figure className="mt-4 overflow-hidden rounded-2xl">
        <NewsImage src={article.cover.coverUrl} alt={article.cover.coverAlt} className="aspect-[2/1] w-full object-cover" />
        {article.cover.coverCaption ? <figcaption className="pt-2 text-xs text-white/45">{article.cover.coverCaption}</figcaption> : null}
      </figure> : null}
    </header>
    <p className="whitespace-pre-line break-words text-sm leading-7 text-white/75">{article.introduction}</p>
    {orderedMatches.map((match, index) => {
      const isTeamMatch = [match.teamAId, match.teamBId].includes(teamId);
      const startsAroundLeague = index === teamMatches.length && otherMatches.length > 0;

      return <div key={match.fixtureId}>
        {startsAroundLeague ? (
          <h3 className="mb-3 mt-7 text-xs font-black uppercase tracking-[0.16em] text-white/35">
            Around the league
          </h3>
        ) : null}
        <section className={`rounded-2xl border p-4 ${isTeamMatch ? "border-emerald-300/20 bg-emerald-500/[0.07]" : "border-white/10 bg-white/[0.035]"}`}>
          {isTeamMatch ? <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-300">Your match</p> : null}
          <div className="grid grid-cols-[minmax(0,1fr)_3.8rem_minmax(0,1fr)] items-start gap-2 text-center">
            <div className="min-w-0">
              <NewsImage src={match.badgeA} alt={`${match.teamA} badge`} fallback={match.teamA.slice(0,2)} className="mx-auto h-10 w-10 object-contain" />
              <h4 className="mx-auto mt-2 max-w-[8rem] break-words text-[11px] font-bold leading-4">{match.teamA}</h4>
            </div>
            <p aria-label={`${match.scoreA} to ${match.scoreB}`} className="rounded-lg bg-black/25 px-2 py-2 text-xl font-black tabular-nums">{match.scoreA}–{match.scoreB}</p>
            <div className="min-w-0">
              <NewsImage src={match.badgeB} alt={`${match.teamB} badge`} fallback={match.teamB.slice(0,2)} className="mx-auto h-10 w-10 object-contain" />
              <h4 className="mx-auto mt-2 max-w-[8rem] break-words text-[11px] font-bold leading-4">{match.teamB}</h4>
            </div>
          </div>
          <p className="mt-4 whitespace-pre-line break-words text-sm leading-7 text-white/75">{match.paragraph}</p>
          {match.scorers.length ? <div className="mt-4 border-t border-white/10 pt-3"><h5 className="text-xs font-bold text-emerald-200">Goalscorers</h5><ul className="mt-2 space-y-1 text-xs leading-5 text-white/60">{match.scorers.map((scorer, scorerIndex) => <li key={scorerIndex}>{scorer.name}{scorer.goals > 1 ? ` ×${scorer.goals}` : ""} · {scorer.team}</li>)}</ul></div> : null}
          {match.playersOfMatch.length ? <div className="mt-3"><h5 className="text-xs font-bold text-emerald-200">Players of the match</h5><ul className="mt-2 space-y-1 text-xs leading-5 text-white/60">{match.playersOfMatch.map((player, playerIndex) => <li key={playerIndex}>{player.name} · {player.team}</li>)}</ul></div> : null}
        </section>
      </div>;
    })}
    {article.closing ? <p className="whitespace-pre-line break-words text-sm leading-7 text-white/75">{article.closing}</p> : null}
  </article>;
}
