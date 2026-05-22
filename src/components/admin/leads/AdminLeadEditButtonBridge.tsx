// ========================================
// File: src/components/admin/leads/AdminLeadEditButtonBridge.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function getLeadIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/admin\/leads\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

export default function AdminLeadEditButtonBridge() {
  const pathname = usePathname();
  const leadId = getLeadIdFromPathname(pathname);

  if (!leadId) return null;

  return (
    <div className="fixed right-6 top-24 z-[9999] flex flex-wrap gap-3">
      <Link
        href={`/admin/leads/${leadId}/edit`}
        className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500 px-4 text-sm font-semibold text-black shadow-[0_18px_50px_rgba(16,185,129,0.25)] transition hover:bg-emerald-400"
      >
        Edit lead
      </Link>
    </div>
  );
}
