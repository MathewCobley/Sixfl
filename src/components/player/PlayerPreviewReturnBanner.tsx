"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function isPwaPhonePreviewFrame() {
  try {
    return (
      window.self !== window.top &&
      window.parent.location.origin === window.location.origin &&
      window.parent.location.pathname === "/admin/pwa"
    );
  } catch {
    return false;
  }
}

export default function PlayerPreviewReturnBanner({
  returnHref,
  returnLabel,
  isAdmin,
}: {
  returnHref: string;
  returnLabel: string;
  isAdmin: boolean;
}) {
  const [hideInPhonePreview, setHideInPhonePreview] = useState(false);

  useEffect(() => {
    setHideInPhonePreview(isPwaPhonePreviewFrame());
  }, []);

  if (hideInPhonePreview) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-violet-300/25 bg-violet-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200/80">
            {isAdmin ? "Admin player view" : "Player view"}
          </div>
          <div className="mt-1 text-sm text-white/65">
            You can return to the team management area at any time.
          </div>
        </div>
        <Link
          href={returnHref}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-violet-200 px-4 text-sm font-bold text-violet-950 transition hover:bg-white"
        >
          ← {returnLabel}
        </Link>
      </div>
    </div>
  );
}
