import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import NewsFeed from '@/components/news/NewsFeed';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { title: 'League News | SIXFL', description: 'Match-night round-ups and the latest published reports from SIXFL.' };
export default async function LeagueNews({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string; team?: string }> }) {
  const { slug } = await params, query = await searchParams;
  const league = await prisma.league.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (!league) notFound();
  return <main className="mx-auto max-w-6xl space-y-8 px-4 py-10 text-white sm:px-6 sm:py-14"><header><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">SIXFL · Stories from the pitch</p><h1 className="mt-4 text-4xl font-black sm:text-5xl">League News</h1><p className="mt-4 text-lg text-white/65">{league.name}</p></header><NewsFeed leagueId={league.id} highlightTeamId={query.team} page={Number(query.page) || 1} basePath={`/leagues/${encodeURIComponent(slug)}/news`} /></main>;
}
