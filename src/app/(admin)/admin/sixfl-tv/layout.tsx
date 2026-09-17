import Link from "next/link";
import type { ReactNode } from "react";

export default function SixflTvLayout({ children }: { children: ReactNode }) {
  const tab = "inline-flex min-h-11 items-center rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/75 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-emerald-100";
  return <div className="space-y-6">
    <nav aria-label="SIXFL TV" className="flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-black/20 p-2">
      <Link href="/admin/sixfl-tv/fixtures" className={tab}>Fixtures</Link>
      <Link href="/admin/sixfl-tv/goal-of-month" className={tab}>Goal of the Month</Link>
      <Link href="/admin/sixfl-tv/goal-of-week" className={tab}>Goal of the Week</Link>
      <Link href="/admin/sixfl-tv/settings" className={tab}>Settings</Link>
    </nav>
    {children}
  </div>;
}
