'use client';
import { useState } from 'react';
/** The fallback belongs to this image only; no page-wide DOM changes. */
export default function NewsImage({ src, alt, className = '', fallback = 'SIXFL' }: { src: string | null; alt: string; className?: string; fallback?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && failedSrc !== src
    // Public asset bytes are not re-encoded. Never fetch private image URLs server-side.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt={alt} className={className} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} />
    : <span aria-label={alt} className={`inline-flex items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-2 text-xs font-black text-emerald-200 ${className}`}>{fallback}</span>;
}
