"use client";

import { useState } from "react";

export default function SeedButton() {
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <button
        onClick={async () => {
          setStatus("Creating demo data...");
          const res = await fetch("/api/dev/seed", { method: "POST" });
          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            setStatus(data?.error ?? "Seed failed");
            return;
          }

          setStatus("Done! Refreshing...");
          window.location.reload();
        }}
        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
      >
        Create demo team + fixture
      </button>

      {status && <div className="mt-2 text-sm text-white/70">{status}</div>}
    </div>
  );
}