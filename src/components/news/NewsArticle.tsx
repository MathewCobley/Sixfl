import Link from 'next/link';
import { matchAnchor, type PublishedNews } from '@/lib/league-news/types';
import NewsImage from './NewsImage';
import NewsShare from './NewsShare';
export const newsDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
/** The same article markup is used in the protected preview and public route. */
export default function NewsArticle({ news, shareUrl, preview = false, highlightTeamId }: { news: PublishedNews; shareUrl?: string; preview?: boolean; highlightTeamId?: string }) {
  const a = news.article, goals = a.matches.reduce((n, m) => n + m.scoreA + m.scoreB, 0);
  return <article className="overflow-hidden rounded-3xl border border-white/10 bg-[#06120d] text-white">
    <header className="relative border-b border-emerald-300/20 bg-gradient-to-br from-emerald-950 via-[#071a13] to-black px-5 py-10 sm:px-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300"><span>SIXFL · League News</span><span>Matchnight / {newsDate(a.matchDate)}</span></div>
      <p className="mt-8 text-sm font-semibold text-emerald-200">{a.leagueName}</p>
      <h1 className="mt-4 max-w-5xl break-words text-3xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">{a.title}</h1>
      <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/60">
        <span>By SIXFL</span>{!preview ? <span>Published {newsDate(news.publishedAt)}</span> : <span>Website preview · not published by viewing</span>}
        <span>{a.matches.length} matches · {goals} goals</span>
        {!preview && news.updatedAt !== news.publishedAt ? <span>Updated {newsDate(news.updatedAt)}</span> : null}
      </div>
    </header>
    {a.cover ? <figure className="border-b border-white/10">
      <NewsImage src={a.cover.coverUrl} alt={a.cover.coverAlt} className="max-h-[560px] min-h-48 w-full object-cover" />
      {a.cover.coverCaption ? <figcaption className="px-5 py-3 text-sm leading-6 text-white/60 sm:px-10">{a.cover.coverCaption}</figcaption> : null}
    </figure> : null}
    <div className="grid gap-8 px-5 py-8 sm:px-10 sm:py-10 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-12">
      <div className="min-w-0 max-w-3xl">
        <p className="whitespace-pre-line break-words text-lg leading-8 text-white/85 sm:text-xl sm:leading-9">{a.introduction}</p>
        <div className="mt-10 space-y-10">
          {a.matches.map(m => <section key={m.fixtureId} id={matchAnchor(m.fixtureId)} className="scroll-mt-6 border-t border-white/15 pt-7">
            {highlightTeamId && [m.teamAId, m.teamBId].includes(highlightTeamId) ? <p className="mb-4 text-xs font-bold uppercase tracking-widest text-emerald-300">Featuring your team</p> : null}
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.04] p-4 sm:p-5">
              <div className="flex min-w-0 flex-col items-center gap-3 text-center"><NewsImage src={m.badgeA} alt={`${m.teamA} badge`} fallback={m.teamA.slice(0, 2).toUpperCase()} className="h-14 w-14 object-contain sm:h-16 sm:w-16" /><Link href={`/teams/${encodeURIComponent(m.teamAId)}`} className="break-words text-sm font-bold leading-6 hover:text-emerald-200 sm:text-base">{m.teamA}</Link></div>
              <p aria-label={`${m.scoreA} to ${m.scoreB}`} className="whitespace-nowrap text-3xl font-black tabular-nums text-emerald-200 sm:text-4xl">{m.scoreA}<span className="px-1 text-white/35">–</span>{m.scoreB}</p>
              <div className="flex min-w-0 flex-col items-center gap-3 text-center"><NewsImage src={m.badgeB} alt={`${m.teamB} badge`} fallback={m.teamB.slice(0, 2).toUpperCase()} className="h-14 w-14 object-contain sm:h-16 sm:w-16" /><Link href={`/teams/${encodeURIComponent(m.teamBId)}`} className="break-words text-sm font-bold leading-6 hover:text-emerald-200 sm:text-base">{m.teamB}</Link></div>
            </div>
            <h2 className="sr-only">{m.teamA} {m.scoreA}–{m.scoreB} {m.teamB}</h2>
            <p className="mt-5 whitespace-pre-line break-words text-base leading-8 text-white/80 sm:text-lg sm:leading-9">{m.paragraph}</p>
            {m.scorers.length || m.playersOfMatch.length ? <div className="mt-5 space-y-2 border-l-2 border-emerald-400/50 pl-4 text-sm leading-6 text-white/60">
              {m.scorers.length ? <p><strong className="text-white/85">Recorded scorers: </strong>{m.scorers.map(s => `${s.name} (${s.team}, ${s.goals})`).join('; ')}</p> : null}
              {m.playersOfMatch.length ? <p><strong className="text-white/85">Player of the Match: </strong>{m.playersOfMatch.map(p => `${p.name} (${p.team})`).join('; ')}</p> : null}
            </div> : null}
          </section>)}
        </div>
        {a.closing ? <p className="mt-10 whitespace-pre-line break-words border-t border-white/15 pt-7 text-lg leading-8 text-white/80">{a.closing}</p> : null}
      </div>
      <aside className="min-w-0 self-start rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">In this report</h2>
        <nav aria-label="Jump to match" className="mt-4 divide-y divide-white/10">{a.matches.map(m => <Link key={m.fixtureId} href={`#${matchAnchor(m.fixtureId)}`} className="block break-words py-3 text-sm leading-6 text-white/75 hover:text-emerald-200">{m.teamA} <strong className="whitespace-nowrap text-emerald-200">{m.scoreA}–{m.scoreB}</strong> {m.teamB}</Link>)}</nav>
        <p className="mt-4 text-xs leading-6 text-white/50">Match-night round-up. Scorer records may be incomplete.</p>
      </aside>
    </div>
    <footer className="space-y-6 border-t border-white/10 px-5 py-7 sm:px-10">
      {shareUrl && !preview ? <NewsShare url={shareUrl} title={a.title} /> : null}
      <nav aria-label="More from the league" className="flex flex-wrap gap-4 text-sm font-semibold text-emerald-200">
        <Link href={`/leagues/${news.leagueSlug}/news`}>More League News →</Link><Link href={`/leagues/${news.leagueSlug}/results`}>Results</Link><Link href={`/leagues/${news.leagueSlug}#table`}>League table</Link>
      </nav>
    </footer>
  </article>;
}
