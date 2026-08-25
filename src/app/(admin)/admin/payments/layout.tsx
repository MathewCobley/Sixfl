// ========================================
// File: src/app/(admin)/admin/payments/layout.tsx
// ========================================

import Link from "next/link";

export default function AdminPaymentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <nav className="mx-auto flex max-w-7xl flex-wrap gap-2 px-6 pt-6">
        <Link
          href="/admin/payments"
          className="inline-flex items-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08] hover:text-white"
        >
          Payments
        </Link>
        <Link
          href="/admin/payments/team-credits"
          className="inline-flex items-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
        >
          Team credits
        </Link>
        <Link
          href="/admin/payments/kit-funds"
          className="inline-flex items-center rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15"
        >
          Kit funds
        </Link>
        <Link
          href="/admin/payments/player-credits"
          className="inline-flex items-center rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15"
        >
          Player credits
        </Link>
      </nav>
      {children}
    </div>
  );
}
