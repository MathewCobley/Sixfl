import Link from "next/link";
import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPublishedNews, listPublishedNews } from "@/lib/league-news/read";
import { newsDate } from "@/components/news/NewsArticle";
import NewsImage from "@/components/news/NewsImage";
import PlayerNewsArticle from "@/components/player/PlayerNewsArticle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletters | SIXFL Player" };

type Search = { page?: string; league?: string; date?: string; previewMembershipId?: string };

export default async function PlayerNewsPage({ params, searchParams }: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<Search>;
}) {
  const { teamid } = await params;
  const sp = await searchParams;
  const base = `/player/team/${encodeURIComponent(teamid)}/news`;
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) redirect(`/login?callbackUrl=${encodeURIComponent(base)}`);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true, teamMembers: { where: { teamId: teamid }, select: { id: true }, take: 1 } },
  });
  if (!user || (user.role !== UserRole.ADMIN && !user.teamMembers.length)) notFound();
  const team = await prisma.team.findUnique({ where: { id: teamid }, select: { name: true } });
  if (!team) notFound();
  const preview = user.role === UserRole.ADMIN && sp.previewMembershipId
    ? await prisma.teamMember.findFirst({ where: { id: sp.previewMembershipId, teamId: teamid }, select: { id: true } })
    : null;
  function href(values: Record<string, string> = {}) {
    const query = new URLSearchParams(values);
    if (preview) query.set("previewMembershipId", preview.id);
    return `${base}${query.size ? `?${query}` : ""}`;
  }
  if (sp.league || sp.date) {
    if (!sp.league || !sp.date) notFound();
    const news = await getPublishedNews(sp.league, sp.date);
    if (!news || !news.article.matches.some(m => [m.teamAId, m.teamBId].includes(teamid))) notFound();
    return <main className="mx-auto w-full max-w-xl px-3 pt-4 text-white">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-black">Newsletter</h1>
        <Link href={href()} className="inline-flex min-h-11 items-center rounded-xl bg-white/[0.06] px-3 text-xs font-bold text-emerald-200">All newsletters</Link>
      </div>
      <div className="pb-28"><PlayerNewsArticle news={news} teamId={teamid} /></div>
    </main>;
  }
  const requestedPage = Number(sp.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
  const feed = await listPublishedNews({ teamId: teamid, page, limit: 8 });
  return <main className="mx-auto w-full max-w-xl px-3 pt-4 text-white">
    <h1 className="text-2xl font-black">Newsletters</h1>
    <p className="mt-1 text-sm text-white/50">Matchnight stories featuring {team.name}.</p>
    <div className="space-y-3 pb-28 pt-4">
      {feed.items.length ? feed.items.map(news => <Link key={news.id}
        href={href({ league: news.leagueSlug, date: news.article.matchDate })}
        className="block overflow-hidden rounded-2xl border border-emerald-300/15 bg-white/[0.035] active:bg-white/[0.06]">
        {news.article.cover ? <NewsImage src={news.article.cover.coverUrl} alt={news.article.cover.coverAlt} className="aspect-[2/1] w-full object-cover" /> : null}
        <div className="p-4">
          <p className="text-xs font-semibold text-emerald-200">{newsDate(news.article.matchDate)}{news.matchweekNumber ? ` · Matchweek ${news.matchweekNumber}` : ""}</p>
          <h2 className="mt-2 break-words text-lg font-black leading-snug">{news.article.title}</h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/55">{news.article.introduction}</p>
          <span className="mt-3 inline-flex min-h-8 items-center text-xs font-bold text-emerald-300">Read newsletter →</span>
        </div>
      </Link>) : <p className="rounded-2xl border border-white/10 p-5 text-sm leading-6 text-white/55">{page > 1 ? "No more newsletters to show." : "Your team's newsletters will appear here once published."}</p>}
      <nav aria-label="Newsletter pages" className="flex justify-between gap-3 text-sm font-bold text-emerald-200">
        {page > 1 ? <Link className="inline-flex min-h-11 items-center px-2" href={href({ page: String(page - 1) })}>Newer newsletters</Link> : <span />}
        {feed.hasMore ? <Link className="inline-flex min-h-11 items-center px-2" href={href({ page: String(page + 1) })}>Older newsletters</Link> : null}
      </nav>
    </div>
  </main>;
}
