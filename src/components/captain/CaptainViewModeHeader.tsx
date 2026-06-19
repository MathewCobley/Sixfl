// ========================================
// File: src/components/captain/CaptainViewModeHeader.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function CaptainViewModeHeader({
  teamId,
  isAdmin,
  isManagedTeam,
}: {
  teamId: string;
  isAdmin: boolean;
  isManagedTeam: boolean;
}) {
  const pathname = usePathname();
  const isLimitedCaptainPreview = Boolean(pathname?.includes("/captain-squad"));

  const overline = isLimitedCaptainPreview
    ? "Limited captain preview"
    : isAdmin
      ? "SIXFL admin team view"
      : "SIXFL captain hub";

  const description = isLimitedCaptainPreview
    ? "You are viewing the limited captain version. Admin-only squad tools are hidden on this page."
    : isAdmin
      ? isManagedTeam
        ? "Full admin view: squad controls, fixtures, results, prospects and payment tools are visible."
        : "Full admin view: fixtures, results and payment tools are visible."
      : "Matchday control, fixtures, results and payments for your team.";

  return (
    <>
      {isAdmin && !isManagedTeam ? (
        <style>{`
          .captain-team-shell a[href="/captain/team/${teamId}/prospects"] {
            display: none !important;
          }
        `}</style>
      ) : null}

      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
        {overline}
      </p>

      <p className="mt-3 max-w-2xl text-sm text-white/65 sm:text-base">
        {description}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        {isAdmin ? (
          <Link
            href={`/admin/teams/${teamId}`}
            className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white"
          >
            Back to admin team
          </Link>
        ) : null}

        {isAdmin && !isLimitedCaptainPreview ? (
          <Link
            href={`/captain/team/${teamId}/captain-squad`}
            className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Preview limited captain view
          </Link>
        ) : null}

        {isAdmin && isLimitedCaptainPreview ? (
          <Link
            href={`/captain/team/${teamId}/squad`}
            className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Return to full admin view
          </Link>
        ) : null}

        {isAdmin ? (
          <Link
            href={`/admin/teams/${teamId}/squad`}
            className="inline-flex items-center rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 transition hover:bg-amber-500/15"
          >
            Admin squad console
          </Link>
        ) : null}

        {isAdmin && isLimitedCaptainPreview ? (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
            <div className="font-medium text-white">Viewing as captain</div>
            <div className="mt-1 text-amber-100/75">Limited preview mode.</div>
          </div>
        ) : isAdmin ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90">
            <div className="font-medium text-white">Full admin view</div>
            <div className="mt-1 text-emerald-100/70">Admin controls are visible.</div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90">
            <div className="font-medium text-white">Captain view</div>
            <div className="mt-1 text-emerald-100/70">You are signed in to manage this team.</div>
          </div>
        )}
      </div>
    </>
  );
}
