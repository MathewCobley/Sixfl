import Link from "next/link";
import type { ReactNode } from "react";
export default function SixflTvLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-6">
    <nav aria-label="SIXFL TV tools" className="flex flex-wrap gap-3">
      <Link href="/admin/sixfl-tv" className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/5">Published video links</Link>
      <Link href="/admin/sixfl-tv/footage" className="inline-flex min-h-11 items-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20">Upload footage</Link>
    </nav>
    {children}
  </div>;
}
