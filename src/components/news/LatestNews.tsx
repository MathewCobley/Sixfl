'use client';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublishedNews } from '@/lib/league-news/types';
import NewsCard from './NewsCard';
/** Route-owned discovery slot. Only the root dashboard/landing shows a teaser.
 * Published-only data is read separately, so news cannot delay fixtures/payments. */
export default function LatestNews({ scope }: { scope: 'league' | 'team' | 'captain' | 'player' }) {
  const params = useParams(), pathname = usePathname();
  const value = params[scope === 'league' ? 'slug' : scope === 'team' ? 'id' : 'teamid'];
  const id = typeof value === 'string' ? value : '';
  const base = scope === 'league' ? `/leagues/${encodeURIComponent(id)}` : scope === 'team' ? `/teams/${encodeURIComponent(id)}` : `/${scope}/team/${encodeURIComponent(id)}`;
  const visible = Boolean(id && pathname?.replace(/\/$/, '') === base);
  const compact = scope === 'captain' || scope === 'player';
  const url = scope === 'league' ? `${base}/news` : `/teams/${encodeURIComponent(id)}/news`;
  const [items, setItems] = useState<PublishedNews[] | null>(null), [error, setError] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController(); setItems(null); setError(false);
    fetch(`/api/public/league-news/${scope === 'league' ? 'league' : 'team'}/${encodeURIComponent(id)}?limit=${compact ? 1 : 2}`, { cache: 'no-store', signal: controller.signal }).then(async r => {
      const body = await r.json(); if (!r.ok || !Array.isArray(body.items)) throw Error('News unavailable');
      if (!controller.signal.aborted) setItems(body.items);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [visible, scope, id, compact]);
  if (!visible) return null;
  return <section aria-label="Latest League News" className="mx-auto my-6 w-full max-w-6xl space-y-4 px-4 py-4 text-white sm:px-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="text-xl font-black">League News</h2><Link href={url} className="inline-flex min-h-10 items-center text-sm font-semibold text-emerald-200">All news →</Link></div>
    {items?.length ? <div className={`grid gap-4 ${!compact ? 'md:grid-cols-2' : ''}`}>{items.map(n => <NewsCard key={n.id} news={n} teamId={scope === 'league' ? undefined : id} />)}</div> : <p role="status" className="rounded-2xl border border-white/10 p-5 text-sm leading-6 text-white/60">{error ? 'News is temporarily unavailable. Use All news to try again.' : items ? 'Match-night reports will appear here once published by SIXFL.' : 'Loading League News…'}</p>}
  </section>;
}
