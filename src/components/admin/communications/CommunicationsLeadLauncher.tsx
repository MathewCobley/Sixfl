// ========================================
// File: src/components/admin/communications/CommunicationsLeadLauncher.tsx
// ========================================

import Link from "next/link";

export default function CommunicationsLeadLauncher() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
          Lead campaigns
        </div>
        <h2 className="text-2xl font-semibold text-white">Open lead outreach and bulk campaigns</h2>
        <p className="max-w-2xl text-sm text-white/60">
          Lead bulk email and SMS already live in the leads console. Jump straight there from Communications when you want filtered campaigns by area, type, or night.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/admin/leads"
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Open all lead campaigns
        </Link>
        <Link
          href="/admin/leads?type=TEAM"
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
        >
          Team leads
        </Link>
        <Link
          href="/admin/leads?type=PLAYER"
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
        >
          Player leads
        </Link>
        <Link
          href="/admin/leads?type=REFEREE"
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
        >
          Referee leads
        </Link>
      </div>
    </div>
  );
}
