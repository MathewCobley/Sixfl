/** Public-safe news types. No draft, omission, provider or administrative fields. */
export type NewsSettings = { coverUrl: string; coverAlt: string; coverCaption: string };
export type NewsMatch = {
  fixtureId: string; teamAId: string; teamBId: string;
  teamA: string; teamB: string; badgeA: string | null; badgeB: string | null;
  scoreA: number; scoreB: number; paragraph: string;
  scorers: Array<{ team: string; name: string; goals: number }>;
  playersOfMatch: Array<{ team: string; name: string }>;
};
export type NewsSnapshot = {
  schemaVersion: 1; leagueName: string; matchDate: string;
  title: string; introduction: string; closing: string;
  cover: NewsSettings | null; matches: NewsMatch[];
};
export type PublishedNews = {
  id: string; leagueSlug: string; publishedAt: string; updatedAt: string;
  article: NewsSnapshot;
};
export type NewsPublicationState = {
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED'; revision: number;
  sourceVersion: number | null; publishedAt: string | null;
  settings: NewsSettings; url: string;
};
export const newsPath = (slug: string, date: string) => `/leagues/${encodeURIComponent(slug)}/news/${encodeURIComponent(date)}`;
export const matchAnchor = (id: string) => `match-${encodeURIComponent(id)}`;
export const blankNewsSettings = (): NewsSettings => ({ coverUrl: '', coverAlt: '', coverCaption: '' });
