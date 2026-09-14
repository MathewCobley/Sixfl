"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const FILTER_KEYS = ["type", "status", "area", "night"] as const;

export default function LeadDiallerLaunchButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname !== "/admin/leads") return null;

  const diallerParams = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = searchParams.get(key)?.trim();
    if (value) diallerParams.set(key, value);
  }

  const query = diallerParams.toString();
  const href = query ? `/admin/leads/call-queue?${query}` : "/admin/leads/call-queue";
  const filtered = Boolean(query);

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.08] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-black text-white">Lead dialler</div>
        <div className="mt-1 text-xs leading-5 text-white/55">
          {filtered
            ? "The dialler will use the leads matching the filters currently applied below."
            : "No lead filters are applied, so the dialler will use all callable open leads."}
        </div>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-black text-black transition hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300"
      >
        {filtered ? "Call filtered leads" : "Open lead dialler"}
      </Link>
    </div>
  );
}
