import Link from 'next/link';
import { matchAnchor, type PublishedNews } from '@/lib/league-news/types';
import NewsImage from './NewsImage';
import NewsShare from './NewsShare';

export const newsDate = (date: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/London',
}).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));

/** The same article markup is used in the protected preview and public route. */
export default function NewsArticle({
  news,
  shareUrl,
  preview = false,
  highlightTeamId,
}: {
  news: PublishedNews;
  shareUrl?: string;
  preview?: boolean;
  highlightTeamId?: string;
}) {
  const a = news.article;
  const goals = a.matches.reduce((n, m) => n + m.scoreA + m.scoreB, 0);

  return (
    <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#f4f5f1] text-[#07130f] shadow-[0_34px_100px_rgba(0,0,0,0.38)]">
      <header className="grid min-h-[320px] overflow-hidden bg-black lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative flex min-h-[300px] flex-col justify-between overflow-hidden px-6 py-8 text-white sm:px-10 sm:py-10 lg:min-h-[430px] lg:px-12">
          <div className="pointer-events-none absolute -right-10 top-[-8%] h-[120%] w-24 skew-x-[-10deg] bg-emerald-400" />
          <div className="pointer-events-none absolute -right-2 top-[-8%] h-[120%] w-3 skew-x-[-10deg] bg-white/15" />

          <div className="relative z-10">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">SIXFL matchnight</p>
            <div className="mt-7 max-w-sm leading-none">
              <div className="text-5xl font-black uppercase tracking-[-0.06em] sm:text-6xl lg:text-7xl">Weekly</div>
              <div className="mt-1 text-5xl font-black uppercase tracking-[-0.06em] text-transparent sm:text-6xl lg:text-7xl" style={{ WebkitTextStroke: '2px #34d399' }}>News</div>
            </div>
          </div>

          <div className="relative z-10 max-w-sm border-l-2 border-emerald-400 pl-4">
            <p className="text-sm font-bold text-white">{a.leagueName}</p>
            <p className="mt-1 text-sm text-white/60">{newsDate(a.matchDate)}</p>
          </div>
        </div>

        <div className="relative min-h-[280px] overflow-hidden border-t border-white/10 bg-[#0b2018] lg:min-h-[430px] lg:border-l lg:border-t-0">
          {a.cover ? (
            <>
              <NewsImage src={a.cover.coverUrl} alt={a.cover.coverAlt} className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-black/10" />
              {a.cover.coverCaption ? (
                <p className="absolute bottom-4 left-5 right-5 rounded-xl bg-black/60 px-4 py-2 text-xs leading-5 text-white/75 backdrop-blur sm:left-7 sm:right-auto sm:max-w-md">
                  {a.cover.coverCaption}
                </p>
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(52,211,153,0.18),transparent_30%),linear-gradient(135deg,#173b2c_0%,#09150f_55%,#020403_100%)]">
              <div className="absolute inset-[12%] rounded-[2rem] border-2 border-white/25" />
              <div className="absolute left-1/2 top-[12%] h-[76%] border-l-2 border-white/20" />
              <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20 sm:h-32 sm:w-32" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-3xl border border-white/10 bg-black/50 px-7 py-6 text-center shadow-2xl backdrop-blur-sm">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">The night in numbers</p>
                  <p className="mt-3 text-5xl font-black text-white">{a.matches.length}</p>
                  <p className="text-sm font-semibold text-white/60">matches</p>
                  <p className="mt-4 text-3xl font-black text-emerald-300">{goals}</p>
                  <p className="text-sm font-semibold text-white/60">goals</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#07130f]/10 pb-5 text-sm">
          <div>
            <p className="font-bold text-emerald-700">{newsDate(a.matchDate)}</p>
            <p className="mt-1 text-[#07130f]/55">{a.leagueName}</p>
          </div>
          <div className="text-right text-[#07130f]/45">
            <p>By SIXFL</p>
            <p className="mt-1">{a.matches.length} matches · {goals} goals</p>
          </div>
        </div>

        <h1 className="mt-7 max-w-4xl break-words text-3xl font-black leading-[1.08] tracking-[-0.035em] text-[#09140f] sm:text-5xl lg:text-6xl">
          {a.title}
        </h1>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#07130f]/45">
          {!preview ? <span>Published {newsDate(news.publishedAt)}</span> : <span>Website preview · not published by viewing</span>}
          {!preview && news.updatedAt !== news.publishedAt ? <span>Updated {newsDate(news.updatedAt)}</span> : null}
        </div>

        <p className="mt-8 max-w-4xl whitespace-pre-line break-words text-lg font-medium leading-8 text-[#14231c] sm:text-xl sm:leading-9">
          {a.introduction}
        </p>

        <nav aria-label="Jump to match" className="mt-10 border-y border-[#07130f]/10 py-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">In this week&apos;s report</p>
              <p className="mt-1 text-sm text-[#07130f]/50">Every result from the night, in one article.</p>
            </div>
            <Link href={`/leagues/${news.leagueSlug}/results`} className="text-sm font-bold text-emerald-700 hover:text-emerald-600">Full results →</Link>
          </div>
          <div className="mt-5 grid gap-x-6 sm:grid-cols-2">
            {a.matches.map((m) => (
              <Link key={m.fixtureId} href={`#${matchAnchor(m.fixtureId)}`} className="flex items-center justify-between gap-3 border-t border-[#07130f]/8 py-3 text-sm first:border-t-0 hover:text-emerald-700 sm:first:border-t">
                <span className="min-w-0 truncate">{m.teamA} · {m.teamB}</span>
                <strong className="shrink-0 rounded-full bg-[#07130f] px-3 py-1 font-black tabular-nums text-white">{m.scoreA}–{m.scoreB}</strong>
              </Link>
            ))}
          </div>
        </nav>

        <div className="mt-2">
          {a.matches.map((m, index) => {
            const highlighted = Boolean(highlightTeamId && [m.teamAId, m.teamBId].includes(highlightTeamId));
            return (
              <section key={m.fixtureId} id={matchAnchor(m.fixtureId)} className="scroll-mt-6 border-b border-[#07130f]/10 py-9 sm:py-11">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#07130f]/35">Match {index + 1}</p>
                  {highlighted ? <p className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-800">Featuring your team</p> : null}
                </div>

                <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
                  <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <NewsImage src={m.badgeA} alt={`${m.teamA} badge`} fallback={m.teamA.slice(0, 2).toUpperCase()} className="h-11 w-11 shrink-0 object-contain sm:h-14 sm:w-14" />
                    <Link href={`/teams/${encodeURIComponent(m.teamAId)}`} className="min-w-0 break-words text-sm font-black leading-5 hover:text-emerald-700 sm:text-lg">{m.teamA}</Link>
                  </div>
                  <p aria-label={`${m.scoreA} to ${m.scoreB}`} className="whitespace-nowrap rounded-xl bg-[#07130f] px-3 py-2 text-2xl font-black tabular-nums text-white sm:px-5 sm:py-3 sm:text-3xl">
                    {m.scoreA}<span className="px-1.5 text-white/35">–</span>{m.scoreB}
                  </p>
                  <div className="flex min-w-0 items-center justify-end gap-3 text-right sm:gap-4">
                    <Link href={`/teams/${encodeURIComponent(m.teamBId)}`} className="min-w-0 break-words text-sm font-black leading-5 hover:text-emerald-700 sm:text-lg">{m.teamB}</Link>
                    <NewsImage src={m.badgeB} alt={`${m.teamB} badge`} fallback={m.teamB.slice(0, 2).toUpperCase()} className="h-11 w-11 shrink-0 object-contain sm:h-14 sm:w-14" />
                  </div>
                </div>

                <h2 className="sr-only">{m.teamA} {m.scoreA}–{m.scoreB} {m.teamB}</h2>
                <p className="mt-6 max-w-4xl whitespace-pre-line break-words text-base leading-8 text-[#25342d] sm:text-lg sm:leading-9">{m.paragraph}</p>

                {m.scorers.length || m.playersOfMatch.length ? (
                  <div className="mt-6 grid gap-3 rounded-2xl bg-[#e9ede8] p-4 text-sm leading-6 text-[#304139] sm:grid-cols-2 sm:p-5">
                    {m.scorers.length ? <p><strong className="text-[#07130f]">Recorded scorers: </strong>{m.scorers.map((s) => `${s.name} (${s.team}, ${s.goals})`).join('; ')}</p> : <span />}
                    {m.playersOfMatch.length ? <p><strong className="text-[#07130f]">Player of the Match: </strong>{m.playersOfMatch.map((p) => `${p.name} (${p.team})`).join('; ')}</p> : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        {a.closing ? (
          <div className="mt-10 border-l-4 border-emerald-500 bg-[#e9ede8] px-5 py-5 sm:px-6">
            <p className="whitespace-pre-line break-words text-lg font-medium leading-8 text-[#1c2c24]">{a.closing}</p>
          </div>
        ) : null}
      </div>

      <footer className="bg-[#07130f] px-5 py-7 text-white sm:px-10 lg:px-14">
        <div className="mx-auto max-w-5xl space-y-6">
          {shareUrl && !preview ? <NewsShare url={shareUrl} title={a.title} /> : null}
          <nav aria-label="More from the league" className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-bold text-emerald-300">
            <Link href={`/leagues/${news.leagueSlug}/news`}>More League News →</Link>
            <Link href={`/leagues/${news.leagueSlug}/results`}>Results</Link>
            <Link href={`/leagues/${news.leagueSlug}#table`}>League table</Link>
          </nav>
        </div>
      </footer>
    </article>
  );
}
