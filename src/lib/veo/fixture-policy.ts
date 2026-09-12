import { createHash } from 'node:crypto';
import { normaliseVeoPitch } from './allocator';
export { VEO_FIXTURE_TERMS,parseVeoFixtureChoice,type VeoFixtureChoice } from './fixture-choice';
export function veoCameraKey(venueId: string | null, pitch: string, date: string): string {
  return createHash('sha256').update(JSON.stringify([venueId, normaliseVeoPitch(pitch), date])).digest('hex');
}
export function veoVersion(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function validateVeoVideo(raw: string): string {
  const value = raw.trim();
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a full HTTPS YouTube or SIXFL TV link.'); }
  if (value.length > 2000 || url.protocol !== 'https:' || url.username || url.password || url.port ||
    !['youtube.com','www.youtube.com','m.youtube.com','youtu.be','sixfl.co.uk','www.sixfl.co.uk'].includes(url.hostname)) {
    throw new Error('Use an HTTPS YouTube or SIXFL TV link.');
  }
  return value;
}
