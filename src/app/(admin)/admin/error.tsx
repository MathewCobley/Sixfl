"use client";

import { useEffect, useMemo } from "react";

import {
  isStaleAdminDeploymentError,
  reloadAdminForStaleDeployment,
} from "@/components/admin/AdminDeploymentRecovery";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const staleDeployment = useMemo(
    () => isStaleAdminDeploymentError(error),
    [error],
  );

  useEffect(() => {
    if (staleDeployment) reloadAdminForStaleDeployment();
  }, [staleDeployment]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center px-4 py-12 sm:px-6">
      <div className="w-full rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300/75">
          SIXFL Admin
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
          {staleDeployment ? "SIXFL has just been updated" : "This admin page needs reloading"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/60">
          {staleDeployment
            ? "This tab was open on the previous website version. SIXFL is refreshing it onto the latest version now."
            : "The page hit a browser-side error. Reload, then check the current state before repeating any save, payment, message or fixture action."}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-black"
          >
            Reload SIXFL
          </button>
          {!staleDeployment ? (
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/80"
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
