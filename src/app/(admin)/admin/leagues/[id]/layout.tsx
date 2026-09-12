import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import AdminLeagueSeasonTeamsPanel from "@/components/admin/leagues/AdminLeagueSeasonTeamsPanel";
import MergeLeagueDivisionsButton from "@/components/admin/leagues/MergeLeagueDivisionsButton";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { pendingVeoRequestCount } from "@/lib/veo/priority-requests";

export default async function AdminLeagueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const league = await prisma.league.findUnique({
    where: { id },
    select: { id: true, name: true },
  });

  if (!league) notFound();
  const pendingRequests = await pendingVeoRequestCount(id);

  return (
    <div className="space-y-5">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/25 p-2">
        <span className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
          {league.name}
        </span>
        <Link
          href={`/admin/leagues/${league.id}`}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08] hover:text-white"
        >
          League overview
        </Link>
        <Link
          href={`/admin/leagues/${league.id}/advert-video`}
          className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
        >
          Advert video
        </Link>
        <Link
          href={`/admin/leagues/${league.id}/veo-priority`}
          className="min-h-11 rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-4 py-2 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/15"
        >
          Veo Priority{pendingRequests > 0 && <span className="ml-2 rounded-full bg-fuchsia-300/20 px-2 py-0.5 text-xs">{pendingRequests} pending</span>}
        </Link>
      </div>
      <MergeLeagueDivisionsButton />
      <AdminLeagueSeasonTeamsPanel />
      {children}
    </div>
  );
}
