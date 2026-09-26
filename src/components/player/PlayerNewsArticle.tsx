import type { PublishedNews } from "@/lib/league-news/types";
import NewsArticle from "@/components/news/NewsArticle";

/** The real Matchweek News article, rendered in closed player-app mode. */
export default function PlayerNewsArticle({ news, teamId }: { news: PublishedNews; teamId: string }) {
  return <NewsArticle news={news} highlightTeamId={teamId} appMode />;
}
