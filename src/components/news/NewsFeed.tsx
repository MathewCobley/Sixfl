import Link from 'next/link';
import { listPublishedNews } from '@/lib/league-news/read';
import NewsCard from './NewsCard';
export default async function NewsFeed({ leagueId, teamId, highlightTeamId, page = 1, basePath }: { leagueId?: string; teamId?: string; highlightTeamId?: string; page?: number; basePath: string }) {
  const feed = await listPublishedNews({ leagueId, teamId, page });
  const pageHref = (p: number) => `${basePath}?page=${p}${highlightTeamId ? `&team=${encodeURIComponent(highlightTeamId)}` : ''}`;
  return <div className="space-y-6">
    {!feed.items.length ? <div className="rounded-2xl border border-dashed border-white/20 p-8 text-white/65"><h2 className="text-xl font-bold text-white">No published reports yet</h2><p className="mt-3 leading-7">SIXFL match-night stories will appear here after editorial review and publication.</p></div> : <>
      <NewsCard news={feed.items[0]} teamId={highlightTeamId || teamId} featured />
      <div className="grid gap-5 md:grid-cols-2">{feed.items.slice(1).map(n => <NewsCard key={n.id} news={n} teamId={highlightTeamId || teamId} />)}</div>
    </>}
    {feed.page > 1 || feed.hasMore ? <nav aria-label="News pages" className="flex justify-between gap-5 text-sm font-semibold text-emerald-200">{feed.page > 1 ? <Link href={pageHref(feed.page - 1)}>← Newer reports</Link> : <span />}{feed.hasMore ? <Link href={pageHref(feed.page + 1)}>Older reports →</Link> : null}</nav> : null}
  </div>;
}
