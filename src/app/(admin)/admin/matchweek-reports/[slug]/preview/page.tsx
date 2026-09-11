import Link from 'next/link';
import { requireAdmin } from '@/lib/requireAdmin';
import { previewNews } from '@/lib/league-news/manage';
import { ReportError } from '@/lib/matchweek-reports/types';
import NewsArticle from '@/components/news/NewsArticle';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Private website preview | SIXFL', robots: { index: false, follow: false } };
export default async function WebsitePreview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ date?: string; version?: string; revision?: string }> }) {
  await requireAdmin();
  const { slug } = await params, q = await searchParams;
  const back = `/admin/matchweek-reports/${encodeURIComponent(slug)}?date=${q.date || ''}`;
  let news;
  try { news = await previewNews(slug, q.date || '', Number(q.version), Number(q.revision)); }
  catch (e) { if (!(e instanceof ReportError)) throw e; return <main className="rounded-2xl border border-amber-300/20 p-6 text-white"><h1 className="text-2xl font-bold">Preview needs attention</h1><p className="mt-4 text-amber-100">{e.message}</p><Link href={back} className="mt-5 inline-flex min-h-11 items-center font-semibold text-emerald-200">Return to report editor →</Link></main>; }
  return <main className="mx-auto max-w-6xl space-y-5"><div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm leading-7 text-amber-100">Private website preview — viewing does not publish or update the live article. Check names, scores, text and photo permissions, then return to the editor to publish. <Link href={back} className="font-bold underline">Back to editor</Link></div><NewsArticle news={news} preview /></main>;
}
