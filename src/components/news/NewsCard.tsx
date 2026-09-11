import Link from 'next/link';
import { matchAnchor, newsPath, type PublishedNews } from '@/lib/league-news/types';
import NewsImage from './NewsImage';
import { newsDate } from './NewsArticle';
export default function NewsCard({ news, teamId, featured = false }: { news: PublishedNews; teamId?: string; featured?: boolean }) {
  const a = news.article, url = newsPath(news.leagueSlug, a.matchDate);
  const teamMatches = a.matches.filter(m => teamId && [m.teamAId, m.teamBId].includes(teamId));
  return <article className={`overflow-hidden rounded-2xl border border-white/10 bg-[#081810] text-white ${featured ? 'sm:grid sm:grid-cols-[0.8fr_1.2fr]' : ''}`}>
    <Link href={url} tabIndex={-1} aria-hidden="true" className="relative flex min-h-36 items-center justify-center overflow-hidden border-b border-emerald-300/15 bg-gradient-to-br from-emerald-950 to-black p-5 sm:min-h-44">
      {a.cover ? <NewsImage src={a.cover.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="text-center"><p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">SIXFL Matchnight</p><p className="mt-3 text-4xl font-black tracking-tight">{a.matches.length}<span className="ml-2 text-base font-semibold text-white/50">matches</span></p><p className="mt-3 text-sm text-white/65">{newsDate(a.matchDate)}</p></div>}
    </Link>
    <div className="min-w-0 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{a.leagueName} · {newsDate(a.matchDate)}</p>
      {teamMatches.length ? <p className="mt-3 text-xs font-bold text-emerald-200">Featuring your team</p> : null}
      <h3 className={`mt-3 break-words font-black leading-tight ${featured ? 'text-2xl sm:text-3xl' : 'text-xl'}`}><Link href={url} className="hover:text-emerald-200">{a.title}</Link></h3>
      <p className="mt-3 line-clamp-3 break-words text-sm leading-7 text-white/65">{a.introduction}</p>
      <Link href={url} className="mt-4 inline-flex min-h-10 items-center text-sm font-bold text-emerald-200">Read the full report →</Link>
      {teamMatches.length ? <div className="mt-3 border-t border-white/10 pt-3"><p className="text-xs text-white/50">Jump to your match{teamMatches.length === 1 ? '' : 'es'}</p>{teamMatches.map(m => <Link key={m.fixtureId} href={`${url}#${matchAnchor(m.fixtureId)}`} className="mt-2 block text-sm leading-6 text-white/80 underline decoration-white/20 underline-offset-4 hover:text-emerald-200">{m.teamA} {m.scoreA}–{m.scoreB} {m.teamB}</Link>)}</div> : null}
    </div>
  </article>;
}
