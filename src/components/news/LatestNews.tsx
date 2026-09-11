'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublishedNews } from '@/lib/league-news/types';
import NewsCard from './NewsCard';

/** Root-page discovery slot. Published-only data is read separately so news never
 * blocks fixtures, payments or other operational dashboard data. */
export default function LatestNews({ scope }: { scope: 'league' | 'team' | 'captain' | 'player' }) {
  const params = useParams();
  const pathname = usePathname();
  const value = params[scope === 'league' ? 'slug' : scope === 'team' ? 'id' : 'teamid'];
  const id = typeof value === 'string' ? value : '';
  const base = scope === 'league'
    ? `/leagues/${encodeURIComponent(id)}`
    : scope === 'team'
      ? `/teams/${encodeURIComponent(id)}`
      : `/${scope}/team/${encodeURIComponent(id)}`;
  const visible = Boolean(id && pathname?.replace(/\/$/, '') === base);
  const compact = scope === 'captain' || scope === 'player';
  const url = scope === 'league' ? `${base}/news` : `/teams/${encodeURIComponent(id)}/news`;
  const [items, setItems] = useState<PublishedNews[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    setItems(null);
    setError(false);
    fetch(`/api/public/league-news/${scope === 'league' ? 'league' : 'team'}/${encodeURIComponent(id)}?limit=${compact ? 1 : 2}`, {
      cache: 'no-store',
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.items)) throw Error('News unavailable');
      if (!controller.signal.aborted) setItems(body.items);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [visible, scope, id, compact]);

  if (!visible) return null;

  return (
    <section aria-label="Latest League News" className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pb-5 pt-5 text-white sm:px-6 sm:pb-7 sm:pt-7 lg:px-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">New from SIXFL</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">This week&apos;s matchnight report</h2>
        </div>
        <Link href={url} className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-emerald-200 transition hover:bg-white/[0.08]">All news →</Link>
      </div>

      {items?.length ? (
        <NewsCard news={items[0]} teamId={scope === 'league' ? undefined : id} featured />
      ) : (
        <p role="status" className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/55">
          {error ? 'News is temporarily unavailable. Use All news to try again.' : items ? 'Match-night reports will appear here once published by SIXFL.' : 'Loading League News…'}
        </p>
      )}
    </section>
  );
}
