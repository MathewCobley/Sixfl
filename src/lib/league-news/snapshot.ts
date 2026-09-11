import { ReportError, validateContent, type ReportSource, type ReportContent } from '@/lib/matchweek-reports/types';
import { blankNewsSettings, type NewsSettings, type NewsSnapshot } from './types';

export function newsImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (raw.length > 2048 || /[\\\r\n]/.test(raw)) return null;
  if (/^\/(?!\/)/.test(raw)) {
    // Never embed a signed-in page or arbitrary private API as a public image.
    try {
      const u = new URL(raw, 'https://news.invalid');
      const pathname = decodeURIComponent(u.pathname);
      if (u.origin !== 'https://news.invalid' || pathname.includes('..') || pathname.includes('\\')) return null;
      return /^\/(?:admin|captain|player|pay|api)(?:\/|$)/i.test(pathname) && !/^\/api\/team-badges\/[a-zA-Z0-9_-]+$/.test(pathname) ? null : `${u.pathname}${u.search}`;
    } catch { return null; }
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !u.hostname.includes('.') || /^(?:\d+(?:\.\d+){3}|\[.*\])$/.test(u.hostname) || /\.(?:local|internal|localhost)$/.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}
export function validateNewsSettings(value: unknown): NewsSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return blankNewsSettings();
  const v = value as Record<string, unknown>;
  const text = (key: string, max: number) => {
    if (v[key] === undefined) return '';
    if (typeof v[key] !== 'string' || v[key].length > max) throw new ReportError(`The photo ${key} is invalid or too long.`);
    return (v[key] as string).trim();
  };
  const coverUrl = text('coverUrl', 2048), coverAlt = text('coverAlt', 240), coverCaption = text('coverCaption', 400);
  if (coverUrl && (!newsImageUrl(coverUrl) || !coverAlt)) throw new ReportError('Use a public HTTPS photo address and describe the image. Only use photos you have permission to publish.');
  return { coverUrl: coverUrl ? newsImageUrl(coverUrl)! : '', coverAlt, coverCaption };
}
export type NewsFixtureIdentity = {
  id: string;
  homeTeam: { id: string; name: string; logoUrl: string | null };
  awayTeam: { id: string; name: string; logoUrl: string | null };
};
const cleanName = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 160);
/** Explicit allowlist: never spread a ReportSource into a public response. */
export function buildNewsSnapshot(source: ReportSource, content: ReportContent, identities: NewsFixtureIdentity[], settings: NewsSettings): NewsSnapshot {
  const copy = validateContent(content, source);
  const identity = new Map(identities.map(f => [f.id, f]));
  if (!source.matches.length) throw new ReportError('There are no completed matches to publish.');
  return {
    schemaVersion: 1, leagueName: source.leagueName, matchDate: source.matchDate,
    title: copy.title, introduction: copy.introduction, closing: copy.closing,
    cover: settings.coverUrl ? validateNewsSettings(settings) : null,
    matches: source.matches.map(m => {
      const f = identity.get(m.fixtureId);
      if (!f || cleanName(f.homeTeam.name) !== m.teamA || cleanName(f.awayTeam.name) !== m.teamB) throw new ReportError('The fixture teams changed. Refresh the report facts and regenerate before publishing.', 409);
      const paragraph = copy.matches.find(p => p.fixtureId === m.fixtureId)!.paragraph;
      return {
        fixtureId: m.fixtureId, teamAId: f.homeTeam.id, teamBId: f.awayTeam.id,
        teamA: m.teamA, teamB: m.teamB, badgeA: newsImageUrl(f.homeTeam.logoUrl), badgeB: newsImageUrl(f.awayTeam.logoUrl),
        scoreA: m.scoreA, scoreB: m.scoreB, paragraph,
        scorers: m.scorers.map(s => ({ team: s.team, name: s.name, goals: s.goals })),
        playersOfMatch: m.playersOfMatch.map(p => ({ team: p.team, name: p.name })),
      };
    }),
  };
}
/** Re-allowlist the stored publication, even if later migrations add private fields. */
export function readNewsSnapshot(value: unknown): NewsSnapshot {
  const v = value as NewsSnapshot;
  if (!v || v.schemaVersion !== 1 || !Array.isArray(v.matches) || !v.matches.length) throw new Error('Invalid news snapshot');
  const source: ReportSource = { leagueId: '', leagueName: v.leagueName, area: null, matchDate: v.matchDate,
    matches: v.matches.map(m => ({ fixtureId: m.fixtureId, teamA: m.teamA, teamB: m.teamB, scoreA: m.scoreA, scoreB: m.scoreB, scorers: m.scorers, playersOfMatch: m.playersOfMatch })), omittedFixtures: 0, pendingFixtures: 0, warnings: [] };
  return buildNewsSnapshot(source, { title: v.title, introduction: v.introduction, closing: v.closing, matches: v.matches.map(m => ({ fixtureId: m.fixtureId, paragraph: m.paragraph })) },
    v.matches.map(m => ({ id: m.fixtureId, homeTeam: { id: m.teamAId, name: m.teamA, logoUrl: m.badgeA }, awayTeam: { id: m.teamBId, name: m.teamB, logoUrl: m.badgeB } })), v.cover ?? blankNewsSettings());
}
