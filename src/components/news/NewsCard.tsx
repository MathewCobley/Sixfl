import Link from 'next/link';
import { matchAnchor, newsPath, type PublishedNews } from '@/lib/league-news/types';
import NewsImage from './NewsImage';
import { newsDate } from './NewsArticle';

export default function NewsCard({
  news,
  teamId,
  featured = false,
  compact = false,
  integrated = false,
  articleHref,
}: {
  news: PublishedNews;
  teamId?: string;
  featured?: boolean;
  compact?: boolean;
  integrated?: boolean;
  articleHref?: string;
}) {
  const a = news.article;
  const url = articleHref ?? newsPath(news.leagueSlug, a.matchDate);
  const teamMatches = a.matches.filter((m) => teamId && [m.teamAId, m.teamBId].includes(teamId));
  const goals = a.matches.reduce((sum, match) => sum + match.scoreA + match.scoreB, 0);

  if (compact && integrated) {
    return (
      <article className="overflow-hidden rounded-[1.05rem] border border-[#24372f] bg-[#0d1a14] text-white">
        <Link href={url} className="block px-3.5 py-3 text-inherit no-underline active:bg-white/[0.025]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">
              Latest from SIXFL
            </p>
            <span className="shrink-0 rounded-md border border-white/[0.07] bg-black/20 px-2 py-0.5 text-[9px] font-bold text-white/45">
              {news.matchweekNumber ? `MW ${news.matchweekNumber}` : "News"}
            </span>
          </div>

          <h3 className="mt-1.5 line-clamp-2 text-[13px] font-extrabold leading-[1.35] tracking-[-0.01em] text-white">
            {a.title}
          </h3>

          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="min-w-0 truncate text-[10px] leading-4 text-white/42">
              {a.leagueName} · {newsDate(a.matchDate)}
            </p>
            <span className="shrink-0 text-[10px] font-bold text-emerald-200">
              Read report →
            </span>
          </div>

          {teamMatches.length ? (
            <div className="mt-2 border-t border-white/[0.06] pt-2">
              {teamMatches.slice(0, 1).map((m) => (
                <div key={m.fixtureId} className="flex items-center justify-between gap-3 text-[11px] text-white/60">
                  <span className="min-w-0 truncate">{m.teamA} · {m.teamB}</span>
                  <strong className="shrink-0 text-emerald-200">{m.scoreA}–{m.scoreB}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </Link>
      </article>
    );
  }

  if (compact) {
    return (
      <article className="overflow-hidden rounded-[1.15rem] border border-white/[0.08] bg-white/[0.035] text-white">
        <div className="p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
              Latest from SIXFL
            </p>
            <span className="shrink-0 rounded-lg border border-white/[0.08] bg-black/20 px-2 py-1 text-[10px] font-bold text-white/55">
              {news.matchweekNumber ? `MW ${news.matchweekNumber}` : "News"}
            </span>
          </div>

          <p className="mt-2 truncate text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">
            {a.leagueName} · {newsDate(a.matchDate)}
          </p>

          <h3 className="mt-2 line-clamp-2 text-[15px] font-black leading-5 tracking-[-0.015em] text-white">
            <Link href={url} className="active:text-emerald-200">
              {a.title}
            </Link>
          </h3>

          <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/52">
            {a.introduction}
          </p>

          <div className="mt-3">
            <Link
              href={url}
              className="inline-flex min-h-10 items-center rounded-xl bg-emerald-400 px-3.5 text-xs font-black text-black active:bg-emerald-300"
            >
              Read report →
            </Link>
          </div>

          {teamMatches.length ? (
            <div className="mt-3 border-t border-white/[0.07] pt-2.5">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/35">
                Your match
              </p>
              <div className="mt-1.5 space-y-1">
                {teamMatches.map((m) => (
                  <Link
                    key={m.fixtureId}
                    href={`${url}#${matchAnchor(m.fixtureId)}`}
                    className="flex min-h-9 items-center justify-between gap-3 rounded-lg px-1 text-xs text-white/72 active:bg-white/[0.04]"
                  >
                    <span className="min-w-0 truncate">{m.teamA} · {m.teamB}</span>
                    <strong className="shrink-0 text-emerald-200">{m.scoreA}–{m.scoreB}</strong>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article className={`overflow-hidden rounded-3xl border border-emerald-300/20 bg-[#07130f] text-white shadow-[0_24px_70px_rgba(0,0,0,0.28)] ${featured ? 'lg:grid lg:grid-cols-[0.85fr_1.15fr]' : ''}`}>
      <Link href={url} tabIndex={-1} aria-hidden="true" className={`relative flex overflow-hidden border-b border-white/10 bg-black ${featured ? 'min-h-56 lg:min-h-full lg:border-b-0 lg:border-r' : 'min-h-44'}`}>
        {a.cover ? (
          <>
            <NewsImage src={a.cover.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/15" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_30%,rgba(52,211,153,0.22),transparent_24%),linear-gradient(135deg,#0d2d21_0%,#06110c_52%,#000_100%)]">
            <div className="absolute inset-[14%] rounded-2xl border border-white/15" />
            <div className="absolute left-1/2 top-[14%] h-[72%] border-l border-white/15" />
            <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
          </div>
        )}

        <div className="relative z-10 flex w-full items-end justify-between gap-5 p-5 sm:p-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.26em] text-emerald-300">SIXFL</p>
            <p className="mt-1 whitespace-nowrap text-[1.45rem] font-black uppercase leading-tight tracking-[-0.04em] sm:text-4xl">{news.matchweekNumber ? `Matchweek ${news.matchweekNumber} News` : "Matchnight News"}</p>
          </div>
          <div className="shrink-0 rounded-2xl border border-white/10 bg-black/55 px-4 py-3 text-center backdrop-blur-sm">
            <p className="text-2xl font-black text-emerald-300">{a.matches.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">matches</p>
            <p className="mt-2 text-lg font-black text-white">{goals}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">goals</p>
          </div>
        </div>
      </Link>

      <div className="min-w-0 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-300">
          <span>{a.leagueName}</span>
          <span className="text-white/25">•</span>
          <span className="text-white/55">{newsDate(a.matchDate)}</span>
        </div>

        {teamMatches.length ? <p className="mt-4 inline-flex rounded-full bg-emerald-400/12 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-200">Featuring your team</p> : null}

        <h3 className={`mt-4 break-words font-black leading-[1.08] tracking-[-0.025em] ${featured ? 'text-2xl sm:text-4xl' : 'text-2xl'}`}>
          <Link href={url} className="hover:text-emerald-200">{a.title}</Link>
        </h3>

        <p className="mt-4 line-clamp-3 break-words text-sm leading-7 text-white/65 sm:text-base">{a.introduction}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href={url} className="inline-flex min-h-11 items-center rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-black text-black transition hover:bg-emerald-300">{news.matchweekNumber ? `Read Matchweek ${news.matchweekNumber} report` : "Read full report"} →</Link>
          <Link href={`/leagues/${news.leagueSlug}/results`} className="inline-flex min-h-11 items-center rounded-full border border-white/12 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:text-white">Results</Link>
        </div>

        {teamMatches.length ? (
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Your match{teamMatches.length === 1 ? '' : 'es'} in the report</p>
            {teamMatches.map((m) => (
              <Link key={m.fixtureId} href={`${url}#${matchAnchor(m.fixtureId)}`} className="mt-3 flex items-center justify-between gap-3 text-sm leading-6 text-white/80 underline decoration-white/20 underline-offset-4 hover:text-emerald-200">
                <span className="min-w-0">{m.teamA} · {m.teamB}</span>
                <strong className="shrink-0 text-emerald-200">{m.scoreA}–{m.scoreB}</strong>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
