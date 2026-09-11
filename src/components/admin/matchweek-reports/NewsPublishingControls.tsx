'use client';
import { useEffect, useRef, useState } from 'react';
import { blankNewsSettings, type NewsSettings, type NewsPublicationState } from '@/lib/league-news/types';
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
const field = 'mt-2 w-full rounded-xl border border-white/15 bg-black/30 p-3 text-base text-white';
export default function NewsPublishingControls({ slug, date, draftVersion, sourceHash, blocked, stale }: { slug: string; date: string; draftVersion: number; sourceHash: string; blocked: boolean; stale: boolean }) {
  const endpoint = `/api/admin/matchweek-reports/${encodeURIComponent(slug)}`;
  const [publication, setPublication] = useState<NewsPublicationState | null>(null);
  const [settings, setSettings] = useState<NewsSettings>(blankNewsSettings);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const inFlight = useRef(false);
  const dirty = publication && JSON.stringify(settings) !== JSON.stringify(publication.settings);
  const settingsDirty = useRef(false); settingsDirty.current = Boolean(dirty);
  function accept(p: NewsPublicationState) { setPublication(p); setSettings(p.settings); }
  useEffect(() => {
    const controller = new AbortController();
    setPublication(null); setError('');
    fetch(`${endpoint}?date=${date}&publication=1`, { cache: 'no-store', signal: controller.signal }).then(async r => {
      const p = await r.json(); if (!r.ok || !p.publication) throw Error(p.error || 'Could not read publication status.');
      if (!controller.signal.aborted) { setPublication(p.publication); if (!settingsDirty.current) setSettings(p.publication.settings); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [endpoint, date, draftVersion]);
  async function refresh() {
    if (inFlight.current) return;
    if (dirty && !window.confirm('Reload saved photo settings and discard your unsaved photo changes?')) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const r = await fetch(`${endpoint}?date=${date}&publication=1`, { cache: 'no-store' });
      const p = await r.json(); if (!r.ok || !p.publication) throw Error(p.error || 'Could not check publication status.');
      accept(p.publication); setNotice('Publication status refreshed. No report was generated or published.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check publication status.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function write(action: 'news-settings' | 'publish' | 'unpublish') {
    if (inFlight.current || !publication || (blocked && action !== 'unpublish') || !draftVersion) return;
    if (action === 'publish' && (stale || dirty)) return;
    if (action === 'publish' && !window.confirm('Publish this saved report to the public website? Confirm you have checked names, scores, text and photo permissions. No email or social notification will be sent.')) return;
    if (action === 'unpublish' && !window.confirm('Remove this article from the public website, team news and league archive? Your draft and publication history will be kept.')) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sixfl-Report': '1' }, body: JSON.stringify({ action, requestId: crypto.randomUUID(), matchDate: date, draftVersion, sourceHash, revision: publication.revision, ...(action === 'news-settings' ? { settings } : {}) }) });
      const p = await r.json(); if (!r.ok || !p.publication) throw Error(p.error || 'Publishing outcome not confirmed. Refresh publication status before trying again.');
      accept(p.publication);
      setNotice(action === 'publish' ? 'Published to League News. The approved article is now public.' : action === 'unpublish' ? 'Unpublished. The article is no longer available publicly; your draft is kept.' : 'Photo settings saved privately. Preview or publish when ready; the live article is unchanged.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Outcome not confirmed. Refresh publication status before trying again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const canPreview = Boolean(publication && draftVersion && !blocked && !busy && !stale && !dirty);
  return <section aria-label="Website publishing" className="rounded-3xl border border-emerald-300/25 bg-emerald-500/[0.04] p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black text-white">Publish to League News</h2><p className="text-sm font-semibold text-emerald-200">{publication?.status === 'PUBLISHED' ? `Live · draft version ${publication.sourceVersion}` : publication?.status === 'UNPUBLISHED' ? 'Unpublished · draft retained' : publication ? 'Not published' : 'Checking publication status…'}</p></div>
    <p className="mt-3 text-sm leading-7 text-white/65">One approved article, shared across league, team and player pages. Saving or regenerating a draft never changes the live article. Publishing does not use AI credits or send notifications.</p>
    {!draftVersion ? <p className="mt-3 text-sm text-amber-200">Generate and save a report first, then preview and publish it here.</p> : null}
    {stale ? <p className="mt-3 text-sm text-amber-200">The draft is out of date. Refresh the source facts and regenerate before previewing or publishing. An existing live article stays unchanged.</p> : null}
    {blocked ? <p className="mt-3 text-sm text-amber-200">Finish saving your report edits or wait for the current operation first.</p> : null}
    <details className="mt-4 rounded-xl border border-white/10 p-4"><summary className="cursor-pointer text-sm font-bold text-white">Optional feature photograph</summary>
      <p className="mt-3 text-xs leading-6 text-white/60">Leave blank for the SIXFL branded heading. Use a public HTTPS photo address and only imagery you have permission to publish.</p>
      <fieldset disabled={!publication || busy || blocked || !draftVersion} className="mt-3 space-y-3">
        <label className="block text-sm text-white/75">Photo URL<input value={settings.coverUrl} maxLength={2048} onChange={e => setSettings(s => ({ ...s, coverUrl: e.target.value }))} className={field} /></label>
        <label className="block text-sm text-white/75">Image description (required with a photo)<input value={settings.coverAlt} maxLength={240} onChange={e => setSettings(s => ({ ...s, coverAlt: e.target.value }))} className={field} /></label>
        <label className="block text-sm text-white/75">Caption / photo credit<input value={settings.coverCaption} maxLength={400} onChange={e => setSettings(s => ({ ...s, coverCaption: e.target.value }))} className={field} /></label>
        <button type="button" onClick={() => write('news-settings')} disabled={!dirty} className={button}>Save photo settings</button>
      </fieldset>
    </details>
    <div className="mt-5 flex flex-wrap gap-3">
      {canPreview ? <a href={`/admin/matchweek-reports/${encodeURIComponent(slug)}/preview?date=${date}&version=${draftVersion}&revision=${publication!.revision}`} target="_blank" rel="noopener noreferrer" className={button}>Preview website version ↗</a> : <span aria-disabled="true" className={`${button} cursor-not-allowed opacity-40`}>Preview website version</span>}
      <button type="button" onClick={() => write('publish')} disabled={!canPreview} className={`${button} bg-emerald-400 !text-black hover:!bg-emerald-300`}>{busy ? 'Working…' : publication?.status === 'PUBLISHED' ? 'Update published article' : 'Publish to League News'}</button>
      {publication?.status === 'PUBLISHED' ? <><a href={publication.url} target="_blank" rel="noopener noreferrer" className={button}>View live article ↗</a><button type="button" disabled={busy} onClick={() => write('unpublish')} className={button}>Unpublish</button></> : null}
      <button type="button" onClick={refresh} disabled={busy} className={button}>Refresh publication status</button>
    </div>
    {dirty ? <p className="mt-3 text-sm text-amber-200">Save the photo settings before previewing or publishing.</p> : null}
    {notice ? <p role="status" className="mt-4 text-sm leading-7 text-emerald-200">{notice}</p> : null}
    {error ? <p role="alert" className="mt-4 rounded-xl border border-amber-300/20 p-3 text-sm leading-7 text-amber-100">{error}</p> : null}
  </section>;
}
