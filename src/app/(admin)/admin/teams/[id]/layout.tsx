// ========================================
// File: src/app/(admin)/admin/teams/[id]/layout.tsx
// ========================================

import Link from "next/link";

import AdminPlayerPreviewLinks from "@/components/captain/AdminPlayerPreviewLinks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminTeamDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-5">
      <AdminPlayerPreviewLinks />
      <section className="rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.06] px-4 py-3 shadow-[0_14px_50px_rgba(0,0,0,0.25)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
              Admin preview tools
            </p>
            <p className="mt-1 text-sm text-white/60">
              Open the admin version, true captain-only preview, player view and managed squad tools for this team.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/teams/${id}`}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
            >
              Team overview
            </Link>
            <Link
              href={`/admin/teams/${id}/kickoff-preferences`}
              className="inline-flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15"
            >
              Kickoff rules
            </Link>
            <Link
              href={`/admin/teams/${id}/managed-squad`}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Managed squad
            </Link>
            <Link
              href={`/admin/teams/${id}/captain-admin-view`}
              className="inline-flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
            >
              Admin captain view
            </Link>
            <Link
              href={`/admin/teams/${id}/captain-preview`}
              className="inline-flex items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/15"
            >
              Captain-only preview
            </Link>
            <Link
              href={`/admin/teams/${id}/player-preview`}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Player view
            </Link>
            <Link
              href={`/admin/teams/${id}/prospects`}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Prospects
            </Link>
            <Link
              href={`/admin/messages?composeTeam=${encodeURIComponent(id)}`}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Squad comms
            </Link>
          </div>
        </div>
      </section>

      {children}
    </div>
  );
}
