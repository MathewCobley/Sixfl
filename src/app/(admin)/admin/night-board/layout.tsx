import Link from "next/link";
import type { ReactNode } from "react";

export default function NightBoardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="w-full px-4 pt-5 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 text-sm">
          <Link
            href="/admin/night-board"
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 font-semibold text-white/70 transition hover:border-emerald-400/25 hover:bg-emerald-500/10 hover:text-emerald-100"
          >
            Night Board
          </Link>
          <Link
            href="/admin/night-board/no-fixture-emails"
            className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-2 font-semibold text-sky-100 transition hover:bg-sky-500/15"
          >
            No fixture emails
          </Link>
        </nav>
      </div>
      {children}
    </>
  );
}
