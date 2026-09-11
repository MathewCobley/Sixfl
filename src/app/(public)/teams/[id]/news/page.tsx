import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import NewsFeed from '@/components/news/NewsFeed';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Team News | SIXFL' };
export default async function TeamNews({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params, q = await searchParams;
  const team = await prisma.team.findUnique({ where: { id }, select: { id: true, name: true, league: { select: { slug: true } } } });
  if (!team) notFound();
  return <main className="mx-auto max-w-6xl space-y-8 px-4 py-10 text-white sm:px-6"><header><Link href={`/teams/${encodeURIComponent(id)}`} className="text-sm font-semibold text-emerald-200">← {team.name}</Link><h1 className="mt-5 text-4xl font-black">Team News</h1><p className="mt-4 text-lg text-white/65">Published reports featuring {team.name}.</p>{team.league?.slug ? <Link href={`/leagues/${team.league.slug}/news?team=${encodeURIComponent(id)}`} className="mt-3 inline-flex min-h-10 items-center font-semibold text-emerald-200">All League News →</Link> : null}</header><NewsFeed teamId={id} page={Number(q.page) || 1} basePath={`/teams/${encodeURIComponent(id)}/news`} /></main>;
}
