// ========================================
// File: src/components/admin/messages/AdminMessagingNoticeBridge.tsx
// ========================================

"use client";

import { useSearchParams } from "next/navigation";

export default function AdminMessagingNoticeBridge() {
  const searchParams = useSearchParams();

  if (searchParams.get("queued") !== "1") {
    return null;
  }

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50 sm:mx-6 lg:mx-8">
      SMS reply queued successfully. It will send automatically when the SMS queue next runs.
    </div>
  );
}
