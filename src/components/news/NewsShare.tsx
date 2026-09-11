'use client';
import { useState } from 'react';
export default function NewsShare({ url, title }: { url: string; title: string }) {
  const [notice, setNotice] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(url); setNotice('Article link copied.'); }
    catch { setNotice('Copy is unavailable. You can copy the article address from your browser.'); }
  }
  async function share() {
    try { if (navigator.share) await navigator.share({ title, url }); else await copy(); }
    catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setNotice('Sharing is unavailable. Use Copy link instead.'); }
  }
  return <div className="flex flex-wrap items-center gap-3 text-sm">
    <button type="button" onClick={share} className="min-h-11 rounded-xl bg-emerald-400 px-5 font-bold text-black hover:bg-emerald-300">Share report</button>
    <button type="button" onClick={copy} className="min-h-11 rounded-xl border border-white/20 px-5 font-semibold text-white hover:bg-white/10">Copy link</button>
    <p role="status" className="w-full text-emerald-200">{notice}</p>
  </div>;
}
