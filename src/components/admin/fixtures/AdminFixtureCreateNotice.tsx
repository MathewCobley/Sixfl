// ========================================
// File: src/components/admin/fixtures/AdminFixtureCreateNotice.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function AdminFixtureCreateNotice() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname !== "/admin/fixtures") return null;

  const state = searchParams.get("fixtureCreate");
  if (state !== "success" && state !== "error") return null;

  const leagueId = searchParams.get("leagueId")?.trim() ?? "";
  const message = searchParams.get("fixtureCreateMessage")?.trim() ?? "";
  const requestId = searchParams.get("fixtureRequestId")?.trim() ?? "";
  const cleanHref = leagueId
    ? `/admin/fixtures?leagueId=${encodeURIComponent(leagueId)}`
    : "/admin/fixtures";

  const isSuccess = state === "success";

  return (
    <div className="px-3 pt-4 sm:px-6 lg:px-8">
      <section
        className={[
          "mx-auto flex w-full max-w-[1600px] flex-col gap-3 rounded-2xl border px-5 py-4 text-sm shadow-2xl sm:flex-row sm:items-center sm:justify-between",
          isSuccess
            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-50"
            : "border-red-400/30 bg-red-500/10 text-red-50",
        ].join(" ")}
        role={isSuccess ? "status" : "alert"}
      >
        <div>
          <div className="font-semibold">
            {isSuccess ? "Fixture created successfully" : "Fixture was not created"}
          </div>
          <div className="mt-1 leading-6 opacity-80">
            {isSuccess
              ? "The fixture has been saved and the selected league filter has been kept."
              : message || "Check every required field and try again."}
          </div>
          {!isSuccess && requestId ? (
            <div className="mt-1 text-xs opacity-55">Reference: {requestId}</div>
          ) : null}
        </div>

        <Link
          href={cleanHref}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-black/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/30"
        >
          Dismiss
        </Link>
      </section>
    </div>
  );
}
