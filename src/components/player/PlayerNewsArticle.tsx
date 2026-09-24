import type { PublishedNews } from "@/lib/league-news/types";
import { newsDate } from "@/components/news/NewsArticle";
import NewsImage from "@/components/news/NewsImage";

/** App presentation of the same published snapshot used by the public newsletter. */
export default function PlayerNewsArticle({ news, teamId }: { news: PublishedNews; teamId: string }) {
  const article = news.article;
  return <article className="space-y-5">
    <header>
      <p className="text-xs font-bold text-emerald-200">{article.leagueName} · {newsDate(article.matchDate)}</p>
      <h2 className="mt-2 break-words text-2xl font-black leading-tight">{article.title}</h2>
      {article.cover ? <figure className="mt-4 overflow-hidden rounded-2xl">
        <NewsImage src={article.cover.coverUrl} alt={article.cover.coverAlt} className="aspect-[2/1] w-full object-cover" />
        {article.cover.coverCaption ? <figcaption className="pt-2 text-xs text-white/45">{article.cover.coverCaption}</figcaption> : null}
      </figure> : null}
    </header>
    <p className="whitespace-pre-line break-words text-sm leading-7 text-white/75">{article.introduction}</p>
    {article.matches.map(match => <section key={match.fixtureId} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      {[match.teamAId, match.teamBId].includes(teamId) ? <p className="mb-3 text-xs font-bold text-emerald-300">Your match</p> : null}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 text-center">
        <div className="min-w-0"><NewsImage src={match.badgeA} alt={`${match.teamA} badge`} fallback={match.teamA.slice(0,2)} className="mx-auto h-10 w-10 object-contain" /><h3 className="mt-2 break-words text-xs font-bold">{match.teamA}</h3></div>
        <p aria-label={`${match.scoreA} to ${match.scoreB}`} className="pt-2 text-xl font-black tabular-nums">{match.scoreA}–{match.scoreB}</p>
        <div className="min-w-0"><NewsImage src={match.badgeB} alt={`${match.teamB} badge`} fallback={match.teamB.slice(0,2)} className="mx-auto h-10 w-10 object-contain" /><h3 className="mt-2 break-words text-xs font-bold">{match.teamB}</h3></div>
      </div>
      <p className="mt-4 whitespace-pre-line break-words text-sm leading-7 text-white/75">{match.paragraph}</p>
      {match.scorers.length ? <div className="mt-4 border-t border-white/10 pt-3"><h4 className="text-xs font-bold text-emerald-200">Goalscorers</h4><ul className="mt-2 space-y-1 text-xs leading-5 text-white/60">{match.scorers.map((scorer, index) => <li key={index}>{scorer.name}{scorer.goals > 1 ? ` ×${scorer.goals}` : ""} · {scorer.team}</li>)}</ul></div> : null}
      {match.playersOfMatch.length ? <div className="mt-3"><h4 className="text-xs font-bold text-emerald-200">Players of the match</h4><ul className="mt-2 space-y-1 text-xs leading-5 text-white/60">{match.playersOfMatch.map((player, index) => <li key={index}>{player.name} · {player.team}</li>)}</ul></div> : null}
    </section>)}
    {article.closing ? <p className="whitespace-pre-line break-words text-sm leading-7 text-white/75">{article.closing}</p> : null}
  </article>;
}
