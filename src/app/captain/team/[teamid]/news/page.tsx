import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import NewsImage from "@/components/news/NewsImage";
import { newsDate } from "@/components/news/NewsArticle";
import PlayerNewsArticle from "@/components/player/PlayerNewsArticle";
import { getPublishedNews, listPublishedNews } from "@/lib/league-news/read";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Matchweek reports | SIXFL Captain" };

type Search = {
  page?: string;
  all?: string;
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
  const base = `/captain/team/${encodeURIComponent(teamid)}/news`;

  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, name: true },
  });
  if (!team) notFound();

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
      <main className="mx-auto w-full max-w-xl px-3 pt-4 text-white">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-black">
            {news.matchweekNumber
              ? `Matchweek ${news.matchweekNumber} report`
              : "Matchweek report"}
          </h1>
          <Link
            href={href({ all: "1" })}
            className="inline-flex min-h-11 items-center rounded-xl bg-white/[0.06] px-3 text-xs font-bold text-emerald-200"
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

  if (sp.all !== "1" && !sp.page && feed.items[0]) {
    const latest = feed.items[0];
    redirect(
      href({
        league: latest.leagueSlug,
        date: latest.article.matchDate,
      }),
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-3 pt-4 text-white">
      <h1 className="text-2xl font-black">Matchweek reports</h1>
      <p className="mt-1 text-sm text-white/50">
        Your match first, with the full SIXFL matchnight report kept inside the Captain app.
      </p>

      <div className="space-y-3 pb-28 pt-4">
        {feed.items.length ? (
          feed.items.map((news) => {
            const teamMatches = news.article.matches.filter((match) =>
              [match.teamAId, match.teamBId].includes(teamid),
            );

            return (
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

                  {teamMatches.length ? (
                    <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-500/[0.07] px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
                        Your match{teamMatches.length === 1 ? "" : "es"}
                      </p>
                      <div className="mt-1.5 space-y-2">
                        {teamMatches.map((match) => (
                          <div
                            key={match.fixtureId}
                            className="flex items-center justify-between gap-3"
                          >
                            <h2 className="min-w-0 text-[15px] font-black leading-5 text-white">
                              {match.teamA}{" "}
                              <span className="text-white/35">vs</span>{" "}
                              {match.teamB}
                            </h2>
                            <strong className="shrink-0 rounded-lg bg-black/25 px-2.5 py-1.5 text-base font-black tabular-nums text-emerald-200">
                              {match.scoreA}–{match.scoreB}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">
                    From the full matchweek report
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-white/75">
                    {news.article.title}
                  </p>
                  <span className="mt-3 inline-flex min-h-8 items-center text-xs font-bold text-emerald-300">
                    Read matchweek report →
                  </span>
                </div>
              </Link>
            );
          })
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
              href={href({ all: "1", page: String(page - 1) })}
            >
              Newer reports
            </Link>
          ) : (
            <span />
          )}
          {feed.hasMore ? (
            <Link
              className="inline-flex min-h-11 items-center px-2"
              href={href({ all: "1", page: String(page + 1) })}
            >
              Older reports
            </Link>
          ) : null}
        </nav>
      </div>
    </main>
  );
}
