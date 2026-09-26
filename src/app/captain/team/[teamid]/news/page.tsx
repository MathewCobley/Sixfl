import Link from "next/link";
import { notFound } from "next/navigation";

import { newsDate } from "@/components/news/NewsArticle";
import NewsImage from "@/components/news/NewsImage";
import PlayerNewsArticle from "@/components/player/PlayerNewsArticle";
import { getPublishedNews, listPublishedNews } from "@/lib/league-news/read";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const metadata = { title: "Matchweek reports | SIXFL Captain App" };

type Search = {
  page?: string;
  league?: string;
  date?: string;
};

export default async function CaptainNewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<Search>;
}) {
  const { teamid } = await params;
  const sp = await searchParams;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { name: true },
  });
  if (!team) notFound();

  const base = `/captain/team/${encodeURIComponent(teamid)}/news`;

  function href(values: Record<string, string> = {}) {
    const query = new URLSearchParams(values);
    return `${base}${query.size ? `?${query}` : ""}`;
  }

  if (sp.league || sp.date) {
    if (!sp.league || !sp.date) notFound();

    const news = await getPublishedNews(sp.league, sp.date);
    if (
      !news ||
      !news.article.matches.some((match) =>
        [match.teamAId, match.teamBId].includes(teamid),
      )
    ) {
      notFound();
    }

    return (
      <main className="mx-auto w-full max-w-xl px-3 pt-2 text-white">
        <div
          data-captain-matchweek-toolbar
          className="mb-3 flex min-w-0 items-center justify-between gap-3"
        >
          <h1 className="min-w-0 truncate whitespace-nowrap text-sm font-black tracking-tight text-white">
            {news.matchweekNumber ? `Matchweek ${news.matchweekNumber} report` : "Matchweek report"}
          </h1>
          <Link
            href={href()}
            className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[11px] font-bold text-emerald-200"
          >
            All reports
          </Link>
        </div>
        <div className="pb-28">
          <PlayerNewsArticle news={news} teamId={teamid} />
        </div>
      </main>
    );
  }

  const requestedPage = Number(sp.page);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10000)
      : 1;
  const feed = await listPublishedNews({ teamId: teamid, page, limit: 8 });

  return (
    <main className="mx-auto w-full max-w-xl px-3 pt-4 text-white">
      <h1 className="text-2xl font-black">Matchweek reports</h1>
      <p className="mt-1 text-sm text-white/50">
        Matchnight reports featuring {team.name}.
      </p>

      <div className="space-y-3 pb-28 pt-4">
        {feed.items.length ? (
          feed.items.map((news) => (
            <Link
              key={news.id}
              href={href({
                league: news.leagueSlug,
                date: news.article.matchDate,
              })}
              className="block overflow-hidden rounded-2xl border border-emerald-300/15 bg-white/[0.035] active:bg-white/[0.06]"
            >
              {news.article.cover ? (
                <NewsImage
                  src={news.article.cover.coverUrl}
                  alt={news.article.cover.coverAlt}
                  className="aspect-[2/1] w-full object-cover"
                />
              ) : null}
              <div className="p-4">
                <p className="text-xs font-semibold text-emerald-200">
                  {newsDate(news.article.matchDate)}
                  {news.matchweekNumber
                    ? ` · Matchweek ${news.matchweekNumber}`
                    : ""}
                </p>
                <h2 className="mt-2 break-words text-lg font-black leading-snug">
                  {news.article.title}
                </h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/55">
                  {news.article.introduction}
                </p>
                <span className="mt-3 inline-flex min-h-8 items-center text-xs font-bold text-emerald-300">
                  Read matchweek report →
                </span>
              </div>
            </Link>
          ))
        ) : (
          <p className="rounded-2xl border border-white/10 p-5 text-sm leading-6 text-white/55">
            {page > 1
              ? "No more matchweek reports to show."
              : "Your team's matchweek reports will appear here once published."}
          </p>
        )}

        <nav
          aria-label="Matchweek report pages"
          className="flex justify-between gap-3 text-sm font-bold text-emerald-200"
        >
          {page > 1 ? (
            <Link
              className="inline-flex min-h-11 items-center px-2"
              href={href({ page: String(page - 1) })}
            >
              Newer reports
            </Link>
          ) : (
            <span />
          )}
          {feed.hasMore ? (
            <Link
              className="inline-flex min-h-11 items-center px-2"
              href={href({ page: String(page + 1) })}
            >
              Older reports
            </Link>
          ) : null}
        </nav>
      </div>
    </main>
  );
}
