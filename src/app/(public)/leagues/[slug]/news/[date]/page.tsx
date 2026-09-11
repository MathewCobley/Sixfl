import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublishedNews } from '@/lib/league-news/read';
import { newsPath } from '@/lib/league-news/types';
import NewsArticle from '@/components/news/NewsArticle';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
type Props = { params: Promise<{ slug: string; date: string }>; searchParams?: Promise<{ team?: string }> };
const origin = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sixfl.co.uk').replace(/\/$/, '');
async function article(params: Props['params']) {
  const { slug, date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const news = await getPublishedNews(slug, date);
  if (!news) notFound();
  return news;
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = await article(params), a = n.article, url = `${origin()}${newsPath(n.leagueSlug, a.matchDate)}`;
  const images = a.cover ? [{ url: new URL(a.cover.coverUrl, origin()).href, alt: a.cover.coverAlt }] : undefined;
  return { title: `${a.title} | SIXFL`, description: a.introduction.slice(0, 180), alternates: { canonical: url },
    openGraph: { type: 'article', title: a.title, description: a.introduction.slice(0, 180), url, publishedTime: n.publishedAt, modifiedTime: n.updatedAt, images },
    twitter: { card: images ? 'summary_large_image' : 'summary', title: a.title, description: a.introduction.slice(0, 180), images: images?.map(i => i.url) } };
}
export default async function PublicNewsArticle({ params, searchParams }: Props) {
  const n = await article(params), q = await searchParams;
  return <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-10"><NewsArticle news={n} shareUrl={`${origin()}${newsPath(n.leagueSlug, n.article.matchDate)}`} highlightTeamId={q?.team} /></main>;
}
